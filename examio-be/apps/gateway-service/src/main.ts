import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'gateway-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { GatewayModule } from './gateway.module';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
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

    // Light defense-in-depth validation for typed DTOs. `whitelist` strips
    // unknown properties; `forbidNonWhitelisted` is intentionally NOT set
    // because several proxy handlers accept `@Body() body: any` and forward
    // it as-is downstream.
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

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

    const port = process.env.PORT || 3000;
    await app.listen(port);

    console.log(`🚀 Gateway running on http://localhost:${port}`);
    if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
        console.log(`📚 Swagger docs: http://localhost:${port}/api`);
    }
}
bootstrap();
