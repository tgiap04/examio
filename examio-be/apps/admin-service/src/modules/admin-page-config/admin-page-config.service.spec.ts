import { BadRequestException } from '@nestjs/common';
import { AdminPageConfigService } from './admin-page-config.service';

function make() {
    const prisma: any = {
        pageFeatureFlag: {
            findMany: jest.fn().mockResolvedValue([]),
            upsert: jest.fn(),
        },
        adminAudit: { create: jest.fn().mockResolvedValue({}) },
    };
    const redis: any = {
        publish: jest.fn().mockResolvedValue(1),
        set: jest.fn().mockResolvedValue(undefined),
    };
    return { service: new AdminPageConfigService(prisma, redis), prisma, redis };
}

describe('AdminPageConfigService', () => {
    describe('list', () => {
        it('tự sinh dòng cho key thuộc TOGGLEABLE_PAGE_KEYS nhưng chưa có bản ghi DB', async () => {
            const { service } = make();
            const { pages } = await service.list();
            const studyRoom = pages.find((p) => p.key === 'study-room');
            expect(studyRoom).toBeDefined();
            expect(studyRoom?.enabled).toBe(true);
            expect(studyRoom?.label).toBe('Phòng học chung');
        });

        it('ưu tiên bản ghi DB thật khi đã tồn tại', async () => {
            const { service, prisma } = make();
            prisma.pageFeatureFlag.findMany.mockResolvedValue([
                {
                    key: 'study-room',
                    label: 'Custom Label',
                    enabled: false,
                    updatedAt: new Date('2026-01-01'),
                },
            ]);
            const { pages } = await service.list();
            const studyRoom = pages.find((p) => p.key === 'study-room');
            expect(studyRoom?.enabled).toBe(false);
            expect(studyRoom?.label).toBe('Custom Label');
        });

        it('trả về sắp xếp theo key', async () => {
            const { service } = make();
            const { pages } = await service.list();
            const keys = pages.map((p) => p.key);
            expect(keys).toEqual([...keys].sort());
        });
    });

    describe('toggle', () => {
        it('từ chối key không hợp lệ', async () => {
            const { service } = make();
            await expect(
                service.toggle('not-a-real-key', true, { adminId: 'a1' })
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('upsert thành công cho key chưa từng seed (không throw NotFound)', async () => {
            const { service, prisma, redis } = make();
            prisma.pageFeatureFlag.upsert.mockResolvedValue({
                key: 'study-room',
                label: 'Phòng học chung',
                enabled: false,
                updatedAt: new Date('2026-01-01'),
            });
            const row = await service.toggle('study-room', false, {
                adminId: 'a1',
            });
            expect(prisma.pageFeatureFlag.upsert).toHaveBeenCalledWith({
                where: { key: 'study-room' },
                update: { enabled: false },
                create: {
                    key: 'study-room',
                    label: 'Phòng học chung',
                    enabled: false,
                },
            });
            expect(row.enabled).toBe(false);
            expect(redis.publish).toHaveBeenCalled();
        });
    });
});
