import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { Subject } from 'rxjs';
import { RedisService } from '@examio/redis';
import { CONFIG_PAGES_CHANNEL, CONFIG_PAGES_KEY } from '@examio/common';

export type PageFlagMap = Record<string, boolean>;

/**
 * Nguồn đọc cấu hình trang bật/tắt cho gateway.
 *
 * - `getPages()` đọc Redis (O(1), 1 string JSON). Gateway không còn chạm DB:
 *   admin-service dựng cache lúc boot và mỗi lần toggle. Cache miss = mọi trang
 *   đều bật (default-on). RedisService tự JSON.stringify/parse nên lưu thẳng
 *   object, không stringify tay (tránh double-encode).
 * - SSE `/config/stream` lắng nghe `changes$`. Service subscribe Redis channel
 *   `config:pages` MỘT LẦN (onModuleInit) rồi fan-out qua RxJS Subject cho mọi
 *   connection — tránh mỗi connection tự subscribe/unsubscribe trên shared
 *   subscriber của RedisService.
 */
@Injectable()
export class ConfigService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ConfigService.name);
    private readonly changesSubject = new Subject<PageFlagMap>();

    constructor(private readonly redis: RedisService) {}

    /** Stream map mới mỗi khi admin toggle (đẩy từ Redis pub/sub). */
    get changes$() {
        return this.changesSubject.asObservable();
    }

    async onModuleInit(): Promise<void> {
        try {
            await this.redis.subscribe(CONFIG_PAGES_CHANNEL, (message) => {
                const map = this.safeParse(message);
                if (map) this.changesSubject.next(map);
            });
        } catch (err) {
            this.logger.error(
                `Failed to subscribe ${CONFIG_PAGES_CHANNEL}: ${String(err)}`
            );
        }
    }

    async onModuleDestroy(): Promise<void> {
        try {
            await this.redis.unsubscribe(CONFIG_PAGES_CHANNEL);
        } catch {
            // ignore — shutting down
        }
        this.changesSubject.complete();
    }

    /** Đọc map flag từ cache. Trả `{ [key]: enabled }`, `{}` nếu chưa có. */
    async getPages(): Promise<PageFlagMap> {
        const cached = await this.redis.get<PageFlagMap>(CONFIG_PAGES_KEY);
        return cached && typeof cached === 'object' ? cached : {};
    }

    /** `GatewayControl.SetPageFlags`: ghi cache rồi phát cho mọi SSE client. */
    async setPages(flags: PageFlagMap): Promise<void> {
        await this.redis.set(CONFIG_PAGES_KEY, flags);
        await this.redis.publish(CONFIG_PAGES_CHANNEL, JSON.stringify(flags));
    }

    private safeParse(raw: string): PageFlagMap | null {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return parsed as PageFlagMap;
            }
            return null;
        } catch {
            return null;
        }
    }
}
