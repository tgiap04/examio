import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GatewayClient } from '../../clients/gateway.client';
import { PrismaService } from '../../prisma';
import {
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
 * `PageFeatureFlag` là dữ liệu của admin; cờ runtime thuộc về gateway. Admin
 * KHÔNG ghi Redis nữa: mọi thay đổi đẩy qua gRPC `GatewayControl.SetPageFlags`
 * (gateway ghi key của nó và phát SSE). Thứ tự khi toggle:
 *   1. DB (PageFeatureFlag) — nguồn sự thật
 *   2. Ghi audit (bọc try/catch — không để audit lỗi làm hỏng toggle)
 *   3. Đẩy full map sang gateway; lỗi thì ném lại để admin thử lại (set-style, an toàn)
 * Gateway khởi động mà Redis trống thì tự kéo `AdminService.GetPageFlags` (getFlags).
 */
@Injectable()
export class AdminPageConfigService implements OnModuleInit {
    private readonly logger = new Logger(AdminPageConfigService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly gateway: GatewayClient
    ) {}

    /**
     * Gateway không còn đọc DB: cache miss = mọi trang bật. Nên admin đẩy full
     * map sang gateway lúc boot để cờ đã tắt vẫn có hiệu lực sau khi Redis bị
     * xóa/khởi động lại. Không bao giờ chặn admin-service khởi động.
     */
    async onModuleInit(): Promise<void> {
        try {
            await this.pushFlags();
        } catch (err) {
            this.logger.warn(`page-flag warm-up failed: ${String(err)}`);
        }
    }

    private pushChain: Promise<unknown> = Promise.resolve();

    /**
     * Đẩy full map sang gateway, tuần tự: mỗi lần đẩy ĐỌC LẠI map từ DB ngay
     * trước khi gửi, nên lần đẩy cuối luôn là trạng thái DB mới nhất (hai toggle
     * song song không thể để map cũ ghi đè map mới).
     */
    private pushFlags(): Promise<void> {
        const run = this.pushChain.then(async () => this.gateway.setPageFlags(await this.getFlags()));
        this.pushChain = run.catch(() => undefined);
        return run;
    }

    /** `{ key: enabled }` từ DB: nguồn của `AdminService.GetPageFlags`. */
    async getFlags(): Promise<Record<string, boolean>> {
        const rows = await this.prisma.pageFeatureFlag.findMany();
        const map: Record<string, boolean> = {};
        for (const r of rows) map[r.key] = r.enabled;
        return map;
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

        // 2. Audit (không chặn luồng chính nếu lỗi)
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

        // 3. Gateway (SetPageFlags) — lỗi thì admin thấy và thử lại.
        await this.pushFlags();

        return {
            key: row.key,
            label: row.label,
            enabled: row.enabled,
            updatedAt: row.updatedAt.toISOString(),
        };
    }
}
