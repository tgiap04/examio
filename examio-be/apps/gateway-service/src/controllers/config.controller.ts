import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Subscription, map, merge, timer } from 'rxjs';
import { AllowUnverified, Authenticated, Public } from '@examio/auth-jwt';
import { ConfigService } from '../services/config.service';

/**
 * Public config surface cho page-toggle feature.
 *
 * - `GET /config/pages`: FE gọi 1 lần lúc bootstrap để dựng map bật/tắt.
 *   @Public — dùng được cả khi chưa đăng nhập (guest cũng cần ẩn UI).
 * - `GET /config/stream` (SSE): đẩy realtime map mới mỗi khi admin toggle.
 *   Yêu cầu đăng nhập (mọi user đã xác thực, kể cả email chưa xác minh). Fan-out từ ConfigService.changes$ + heartbeat để giữ
 *   kết nối sống qua proxy/nginx.
 */
@ApiTags('Config')
@Controller('config')
export class ConfigController {
    constructor(private readonly config: ConfigService) {}

    @Get('pages')
    @Public()
    @ApiOperation({ summary: 'Lấy map bật/tắt trang hiển thị (global)' })
    async getPages(): Promise<{ pages: { key: string; enabled: boolean }[] }> {
        const map = await this.config.getPages();
        const pages = Object.entries(map).map(([key, enabled]) => ({
            key,
            enabled,
        }));
        return { pages };
    }

    /**
     * SSE thủ công (thay cho `@Sse`) để kiểm soát header chống buffering.
     *
     * Nguyên nhân treo "pending" trên production: `changes$` chỉ emit khi admin
     * toggle nên stream im lặng nhiều giây đầu; qua edge proxy (nginx/Cloudflare)
     * response không có byte sớm bị buffer → client không nhận header/body.
     * Local không có proxy nên không thấy. Fix (defense-in-depth):
     *  1. `X-Accel-Buffering: no` + `no-transform` → tắt buffer/nén ở proxy.
     *  2. Flush 1 comment ngay khi mở → ép proxy nhả chunk đầu tức thì.
     *  3. Heartbeat bắt đầu tại t=0 rồi mỗi 15s → giữ kết nối dưới ngưỡng idle.
     */
    @Get('stream')
    @Authenticated()
    @AllowUnverified()
    @ApiOperation({ summary: 'SSE stream trạng thái trang realtime' })
    stream(@Req() req: Request, @Res() res: Response): void {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // Chunk đầu tiên đẩy ngay để proxy nhả header + body tức thì.
        res.write(': connected\n\n');

        // event `pages-changed` giữ đúng wire-format cũ của @Sse để FE
        // (configApi.openConfigStream) parse `event:`/`data:` không đổi.
        const changes$ = this.config.changes$.pipe(
            map(
                (pages) =>
                    `event: pages-changed\ndata: ${JSON.stringify(pages)}\n\n`
            )
        );
        // Comment `:` heartbeat — client bỏ qua, chỉ dùng để keep-alive.
        const heartbeat$ = timer(0, 15000).pipe(map(() => ': ping\n\n'));

        const subscription: Subscription = merge(changes$, heartbeat$).subscribe(
            {
                next: (frame) => res.write(frame),
                error: () => res.end(),
            }
        );

        req.on('close', () => {
            subscription.unsubscribe();
            res.end();
        });
    }
}
