import { Controller, Get, Sse, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable, interval, map, merge } from 'rxjs';
import { AuthGuard, OptionalAuthGuard } from '@examio/common';
import { ConfigService } from '../services/config.service';

interface SseMessage {
    data: string | object;
    type?: string;
}

/**
 * Public config surface cho page-toggle feature.
 *
 * - `GET /config/pages`: FE gọi 1 lần lúc bootstrap để dựng map bật/tắt.
 *   OptionalAuthGuard — dùng được cả khi chưa đăng nhập (guest cũng cần ẩn UI).
 * - `GET /config/stream` (SSE): đẩy realtime map mới mỗi khi admin toggle.
 *   Yêu cầu đăng nhập. Fan-out từ ConfigService.changes$ + heartbeat 25s để
 *   giữ kết nối sống qua proxy/nginx.
 */
@ApiTags('Config')
@Controller('config')
export class ConfigController {
    constructor(private readonly config: ConfigService) {}

    @Get('pages')
    @UseGuards(OptionalAuthGuard)
    @ApiOperation({ summary: 'Lấy map bật/tắt trang hiển thị (global)' })
    async getPages(): Promise<{ pages: { key: string; enabled: boolean }[] }> {
        const map = await this.config.getPages();
        const pages = Object.entries(map).map(([key, enabled]) => ({
            key,
            enabled,
        }));
        return { pages };
    }

    @Sse('stream')
    @UseGuards(AuthGuard)
    @ApiOperation({ summary: 'SSE stream trạng thái trang realtime' })
    stream(): Observable<SseMessage> {
        const changes$ = this.config.changes$.pipe(
            map(
                (pages): SseMessage => ({
                    type: 'pages-changed',
                    data: JSON.stringify(pages),
                })
            )
        );
        const heartbeat$ = interval(25000).pipe(
            map((): SseMessage => ({ type: 'heartbeat', data: 'ping' }))
        );
        return merge(changes$, heartbeat$);
    }
}
