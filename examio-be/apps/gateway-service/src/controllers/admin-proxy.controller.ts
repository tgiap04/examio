import {
    All,
    Controller,
    Get,
    Logger,
    Query,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { HttpService } from '@nestjs/axios';
import { JwtAuthGuard } from '@examio/auth-jwt';
import { ProxyService } from '../services/proxy.service';

/**
 * Gateway proxy for admin-service.
 *
 * Forwards `/api/v1/admin/*` to `ADMIN_SERVICE_URL/api/v1/admin/*`.
 * Auth enforcement is delegated to admin-service (single source of truth).
 *
 * Non-streaming requests go through `@All('*')` -> ProxyService.forward.
 * The SSE stream is handled separately with a raw Axios stream so the
 * response stays open end-to-end.
 */
@Controller('admin')
export class AdminProxyController {
    private readonly logger = new Logger(AdminProxyController.name);

    private get adminBaseUrl(): string {
        return process.env.ADMIN_SERVICE_URL || 'http://localhost:7006';
    }

    constructor(
        private readonly proxyService: ProxyService,
        private readonly httpService: HttpService
    ) {}

    /**
     * SSE stream pass-through. EventSource cannot send Authorization
     * headers, so auth is done via the `POST /admin/logs/ticket`
     * handshake. The ticket is forwarded as a query param.
     */
    @Get('logs/stream')
    async streamLogs(
        @Req() req: Request,
        @Res() res: Response,
        @Query() query: Record<string, string>
    ) {
        const token = this.extractToken(req);
        const deviceId = (req.headers['x-device-id'] as string) || '';
        const url = `${this.adminBaseUrl}/api/v1/admin/logs/stream`;

        try {
            const upstream = await this.httpService.axiosRef({
                method: 'GET',
                url,
                params: query,
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(deviceId ? { 'X-Device-ID': deviceId } : {}),
                    Accept: 'text/event-stream',
                    'Cache-Control': 'no-cache',
                },
                responseType: 'stream',
                timeout: 0,
            });

            res.status(upstream.status);
            res.setHeader(
                'Content-Type',
                String(upstream.headers['content-type'] || 'text/event-stream')
            );
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');

            upstream.data.pipe(res);

            req.on('close', () => {
                try {
                    upstream.data.destroy();
                } catch {
                    /* noop */
                }
            });
        } catch (err) {
            this.logger.error(
                `SSE stream proxy error: ${(err as Error).message}`
            );
            if (!res.headersSent) {
                res.status(502).json({ message: 'Upstream SSE error' });
            }
        }
    }

    /**
     * Catch-all forward for any other `/api/v1/admin/*` request.
     * Re-injects Bearer, cookies, device ID, IP, UA via ProxyService.forward.
     *
     * Guarded at the edge with JwtAuthGuard (requires a valid authenticated
     * session) as defense-in-depth; admin-service remains the source of
     * truth for `isAdmin` enforcement. Not applied to `streamLogs` above,
     * since that route authenticates via a query-string ticket and cannot
     * carry a Bearer/cookie token through EventSource.
     */
    @All('*')
    @UseGuards(JwtAuthGuard)
    async forwardAll(@Req() req: Request, @Res() res: Response) {
        const result = await this.proxyService.forward('admin', {
            method: req.method,
            path: req.originalUrl.split('?')[0],
            body: req.body,
            query: req.query as Record<string, string>,
            cookies: req.cookies as Record<string, string>,
            headers: this.extractHeaders(req),
        });
        return res.json(result);
    }

    private extractToken(req: Request): string {
        const auth = req.headers.authorization;
        if (auth?.startsWith('Bearer ')) return auth.substring(7);
        return req.cookies?.token || req.cookies?.accessToken || '';
    }

    private extractHeaders(req: Request): Record<string, string> {
        return {
            'user-agent': req.headers['user-agent'] || '',
            'x-device-id': (req.headers['x-device-id'] as string) || '',
            // Never trust a client-supplied X-Forwarded-For header (it can be
            // spoofed to bypass downstream rate limiting). req.ip is derived
            // by Express from the trusted proxy hop configured in main.ts.
            'x-forwarded-for': req.ip || req.socket.remoteAddress || '',
        };
    }
}
