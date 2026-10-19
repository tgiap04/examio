import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import { RedisService } from '@examio/redis';
import {
    CONFIG_PAGES_CHANNEL,
    CONFIG_PAGES_KEY,
    isToggleablePageKey,
    PAGE_LABELS,
    TOGGLEABLE_PAGE_KEYS,
} from '@examio/common';

export interface AuditContext {
    adminId: string;
    ipAddress?: string;
}

export interface PageConfigRow {
    key: string;
    label: string;
    enabled: boolean;
    updatedAt: string;
}

/**
 * Quản lý trạng thái bật/tắt trang (page-toggle) cho admin.
 *
 * Thứ tự ghi khi toggle (cứng, tránh race giữa cache và nguồn sự thật):
 *   1. DB (PageFeatureFlag) — nguồn sự thật
 *   2. Redis CONFIG_PAGES_KEY — rebuild full map từ DB
 *   3. Publish CONFIG_PAGES_CHANNEL — gateway fan-out qua SSE
 *   4. Ghi audit (bọc try/catch — không để audit lỗi làm hỏng toggle)
 */
@Injectable()
export class AdminPageConfigService implements OnModuleInit {
    private readonly logger = new Logger(AdminPageConfigService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService
    ) {}

    /**
     * Gateway không còn đọc DB: cache miss = mọi trang bật. Nên admin dựng cache
     * lúc boot để cờ đã tắt vẫn có hiệu lực sau khi Redis bị xóa/khởi động lại.
     * Không bao giờ chặn admin-service khởi động.
     */
    async onModuleInit(): Promise<void> {
        try {
            await this.rebuildCache();
        } catch (err) {
            this.logger.warn(`page-flag cache warm-up failed: ${String(err)}`);
        }
    }

    /**
     * Danh sách trang + trạng thái, sắp xếp theo key.
     *
     * Key nào thuộc TOGGLEABLE_PAGE_KEYS nhưng CHƯA có bản ghi DB (page mới
     * thêm, chưa chạy seed) được tự sinh mặc định enabled=true — admin thấy
     * ngay trong UI và bật/tắt được luôn, `toggle()` sẽ tạo bản ghi thật.
     */
    async list(): Promise<{ pages: PageConfigRow[] }> {
        const rows = await this.prisma.pageFeatureFlag.findMany({
            orderBy: { key: 'asc' },
        });
        const known = new Map(rows.map((r) => [r.key, r]));
        const pages: PageConfigRow[] = TOGGLEABLE_PAGE_KEYS.map((key) => {
            const row = known.get(key);
            if (row) {
                return {
                    key: row.key,
                    label: row.label,
                    enabled: row.enabled,
                    updatedAt: row.updatedAt.toISOString(),
                };
            }
            return {
                key,
                label: PAGE_LABELS[key],
                enabled: true,
                updatedAt: new Date(0).toISOString(),
            };
        }).sort((a, b) => a.key.localeCompare(b.key));
        return { pages };
    }

    /** Bật/tắt một trang. */
    async toggle(
        key: string,
        enabled: boolean,
        ctx: AuditContext
    ): Promise<PageConfigRow> {
        if (!isToggleablePageKey(key)) {
            throw new BadRequestException(`Unknown page key: ${key}`);
        }

        // 1. DB (source of truth) — upsert: key hợp lệ nhưng chưa từng seed
        // (page mới thêm) vẫn toggle được ngay, không cần chạy seed thủ công.
        const row = await this.prisma.pageFeatureFlag.upsert({
            where: { key },
            update: { enabled },
            create: { key, label: PAGE_LABELS[key], enabled },
        });

        // 2. Rebuild cache + 3. publish
        const map = await this.rebuildCache();
        try {
            await this.redis.publish(
                CONFIG_PAGES_CHANNEL,
                JSON.stringify(map)
            );
        } catch (err) {
            this.logger.warn(`publish ${CONFIG_PAGES_CHANNEL} failed: ${String(err)}`);
        }

        // 4. Audit (không chặn luồng chính nếu lỗi)
        try {
            await this.prisma.adminAudit.create({
                data: {
                    adminId: ctx.adminId,
                    action: 'admin.page-config.toggle',
                    targetId: key,
                    payload: { enabled },
                    ipAddress: ctx.ipAddress ?? null,
                },
            });
        } catch (err) {
            this.logger.warn(`audit write failed: ${String(err)}`);
        }

        return {
            key: row.key,
            label: row.label,
            enabled: row.enabled,
            updatedAt: row.updatedAt.toISOString(),
        };
    }

    /** Dựng lại full map từ DB và ghi vào Redis. */
    private async rebuildCache(): Promise<Record<string, boolean>> {
        const rows = await this.prisma.pageFeatureFlag.findMany();
        const map: Record<string, boolean> = {};
        for (const r of rows) {
            map[r.key] = r.enabled;
        }
        await this.redis.set(CONFIG_PAGES_KEY, map);
        return map;
    }
}
