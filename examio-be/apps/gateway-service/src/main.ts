import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'gateway-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { GatewayModule } from './gateway.module';
import * as cookieParser from 'cookie-parser';
import * as httpProxy from 'http-proxy';
import { WS_STUDY_PATH } from './ws-study.constant';
import { ConfigService } from './services/config.service';

async function bootstrap() {
    // Fail fast at startup rather than per-request: a missing or too-short
    // JWT_SECRET would otherwise let weak/guessable signing keys slip into
    // production undetected until the first auth-related request fails.
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error('JWT_SECRET missing or too short (min 32 chars)');
    }

    const app = await NestFactory.create(GatewayModule);

    // Trust the first hop (load balancer / reverse proxy) so req.ip reflects
    // the real client IP instead of the LB's address. This MUST be set before
    // any code relies on req.ip (e.g. forwarded x-forwarded-for headers),
    // otherwise a client can spoof its IP via the X-Forwarded-For header.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);

    // Security headers. CSP is scoped to allow Swagger UI's inline
    // script/style tags (served at /api) while still restricting everything
    // else to same-origin.
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: [`'self'`],
                    scriptSrc: [`'self'`, `'unsafe-inline'`],
                    styleSrc: [`'self'`, `'unsafe-inline'`],
                    imgSrc: [`'self'`, 'data:', 'https:'],
                },
            },
        })
    );

    // Cookie parser
    app.use(cookieParser());

    // Global prefix
    app.setGlobalPrefix('api/v1');

    const configuredOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    const allowedOrigins =
        process.env.NODE_ENV === 'production'
            ? configuredOrigins
            : [
                  ...configuredOrigins,
                  'http://localhost:5173',
                  'http://localhost:3001',
                  'http://127.0.0.1:5173',
              ];

    if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
        throw new Error('CORS_ORIGINS or FRONTEND_URL must be configured in production');
    }

    app.enableCors({
        origin: allowedOrigins,
        credentials: true,
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'Cookie',
            'X-Requested-With',
            'X-Device-ID',
        ],
    });

    // Swagger Configuration
    const config = new DocumentBuilder()
        .setTitle('ExamIO API')
        .setDescription(
            `
## ExamIO - Nền tảng Học tập Trực tuyến

### Các Service:
- **Auth**: Đăng ký, đăng nhập, OAuth
- **Exam**: Quiz, Flashcard, Phòng thi
- **Finance**: Wallet, Thanh toán, Subscription

### Authentication:
Sử dụng JWT Bearer token hoặc Cookie-based auth.
        `
        )
        .setVersion('1.0')
        .addBearerAuth(
            {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
            },
            'access-token'
        )
        .addApiKey(
            {
                type: 'apiKey',
                in: 'header',
                name: 'Authorization',
                description: 'Sepay API Key (format: Apikey <key>)',
            },
            'sepay-apikey'
        )
        .addCookieAuth('accessToken')
        .addTag('Auth', 'Authentication & User Management')
        .addTag('Exam', 'Quiz, Flashcard, Exam Room')
        .addTag('Finance', 'Wallet, Payment, Subscription')
        .addTag('Webhook', 'External webhook callbacks (Sepay)')
        .addTag('Gateway', 'Health Check & Status')
        .build();

    if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup('api', app, document, {
            customSiteTitle: 'ExamIO API Documentation',
            customCss: '.swagger-ui .topbar { display: none }',
            swaggerOptions: {
                persistAuthorization: true,
                tagsSorter: 'alpha',
                operationsSorter: 'alpha',
            },
        });
    }

    // WebSocket upgrade proxy cho phòng học chung → exam-service (giữ 1 điểm vào).
    // Chỉ forward các upgrade tới path /ws/study; các upgrade khác bị đóng.
    const examServiceUrl =
        process.env.EXAM_SERVICE_URL || 'http://localhost:3002';
    const wsProxy = httpProxy.createProxyServer({
        target: examServiceUrl,
        ws: true,
        changeOrigin: true,
    });
    wsProxy.on('error', (err, _req, socket) => {
        console.error('[Gateway WS proxy] error:', (err as Error).message);
        if (socket && 'destroy' in socket) (socket as any).destroy();
    });

    // Cùng cơ chế PageEnabledGuard áp cho REST: admin tắt trang 'study-room'
    // thì phòng học chung (kể cả socket đang định mở) không vào được nữa.
    // Default-on — chỉ chặn khi map['study-room'] === false; lỗi đọc config
    // thì fail-open (không để sự cố Redis/DB làm sập cả kênh WS).
    const configService = app.get(ConfigService);
    async function isStudyRoomEnabled(): Promise<boolean> {
        try {
            const pages = await configService.getPages();
            return pages['study-room'] !== false;
        } catch {
            return true;
        }
    }

    // Rate-limit WS upgrade per-IP: ThrottlerGuard chỉ áp HTTP route, không áp
    // raw upgrade — thiếu chốt này thì flood handshake đổ thẳng vào DB auth.
    const WS_UPGRADE_LIMIT = 20; // mỗi IP / 10 giây
    const WS_UPGRADE_WINDOW_MS = 10_000;
    const wsUpgradeHits = new Map<string, { count: number; resetAt: number }>();
    setInterval(() => {
        const now = Date.now();
        for (const [ip, e] of wsUpgradeHits) {
            if (now > e.resetAt) wsUpgradeHits.delete(ip);
        }
    }, 30_000).unref();

    app.getHttpServer().on(
        'upgrade',
        (req: any, socket: any, head: any) => {
            if (typeof req.url !== 'string' || !req.url.startsWith(WS_STUDY_PATH)) {
                socket.destroy();
                return;
            }
            // trust proxy 1 hop (khớp app.set('trust proxy', 1) phía trên).
            const xff = req.headers['x-forwarded-for'];
            const ip =
                (typeof xff === 'string' && xff.split(',')[0].trim()) ||
                req.socket?.remoteAddress ||
                'unknown';
            const now = Date.now();
            const entry = wsUpgradeHits.get(ip);
            if (!entry || now > entry.resetAt) {
                wsUpgradeHits.set(ip, {
                    count: 1,
                    resetAt: now + WS_UPGRADE_WINDOW_MS,
                });
            } else if (++entry.count > WS_UPGRADE_LIMIT) {
                socket.destroy();
                return;
            }
            void isStudyRoomEnabled().then((enabled) => {
                if (!enabled) {
                    socket.destroy();
                    return;
                }
                wsProxy.ws(req, socket, head);
            });
        }
    );

    const port = process.env.PORT || 3000;
    await app.listen(port);

    console.log(`🚀 Gateway running on http://localhost:${port}`);
    if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
        console.log(`📚 Swagger docs: http://localhost:${port}/api`);
    }
}
bootstrap();
