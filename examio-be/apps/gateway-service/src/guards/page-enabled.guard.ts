import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '../services/config.service';
import { PAGE_KEY_METADATA } from './toggle-page.decorator';

/**
 * Chặn API của các trang mà admin đã tắt — trả 404 (KHÔNG 403) để không lộ
 * sự tồn tại của trang/dữ liệu.
 *
 * - Đọc pageKey từ metadata `@TogglePage(...)`. Không có → không kiểm soát, cho qua.
 * - Trạng thái bật/tắt lấy qua `ConfigService.getPages()` (read-through cache).
 * - CHỈ chặn khi `map[pageKey] === false` (tắt tường minh).
 * - FAIL-OPEN: mọi lỗi hạ tầng (Redis/DB) đều cho request đi tiếp — không để
 *   sự cố cache làm sập cả API. Chỉ NotFoundException mới được ném ra ngoài.
 */
@Injectable()
export class PageEnabledGuard implements CanActivate {
    private readonly logger = new Logger(PageEnabledGuard.name);

    constructor(
        private readonly reflector: Reflector,
        private readonly config: ConfigService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const pageKey = this.reflector.getAllAndOverride<string>(
            PAGE_KEY_METADATA,
            [context.getHandler(), context.getClass()]
        );

        if (!pageKey) return true;

        try {
            const pages = await this.config.getPages();
            if (pages[pageKey] === false) {
                throw new NotFoundException();
            }
            return true;
        } catch (err) {
            if (err instanceof NotFoundException) throw err;
            this.logger.warn(
                `fail-open for page "${pageKey}": ${String(err)}`
            );
            return true;
        }
    }
}
