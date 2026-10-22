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
    const gateway = { setPageFlags: jest.fn().mockResolvedValue(undefined) };
    return { service: new AdminPageConfigService(prisma, gateway as never), prisma, gateway };
}

describe('AdminPageConfigService', () => {
    describe('onModuleInit (warms the gateway page-flag state)', () => {
        it('pushes the full DB map to the gateway through SetPageFlags at boot', async () => {
            const { service, prisma, gateway } = make();
            prisma.pageFeatureFlag.findMany.mockResolvedValue([
                { key: 'study-room', enabled: false },
                { key: 'flash-card', enabled: true },
            ]);
            await service.onModuleInit();
            expect(gateway.setPageFlags).toHaveBeenCalledWith({ 'study-room': false, 'flash-card': true });
        });

        it('a gateway or DB failure never blocks the admin service from booting', async () => {
            const { service, prisma, gateway } = make();
            prisma.pageFeatureFlag.findMany.mockRejectedValue(new Error('db down'));
            await expect(service.onModuleInit()).resolves.toBeUndefined();
            prisma.pageFeatureFlag.findMany.mockResolvedValue([]);
            gateway.setPageFlags.mockRejectedValue(new Error('gateway down'));
            await expect(service.onModuleInit()).resolves.toBeUndefined();
        });
    });

    describe('getFlags (served to the gateway by AdminService.GetPageFlags)', () => {
        it('returns key -> enabled from the database', async () => {
            const { service, prisma } = make();
            prisma.pageFeatureFlag.findMany.mockResolvedValue([
                { key: 'study-room', enabled: false },
                { key: 'flash-card', enabled: true },
            ]);
            expect(await service.getFlags()).toEqual({ 'study-room': false, 'flash-card': true });
        });
    });

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

        it('upsert thành công cho key chưa từng seed (không throw NotFound) và đẩy full map qua gateway', async () => {
            const { service, prisma, gateway } = make();
            prisma.pageFeatureFlag.upsert.mockResolvedValue({
                key: 'study-room',
                label: 'Phòng học chung',
                enabled: false,
                updatedAt: new Date('2026-01-01'),
            });
            prisma.pageFeatureFlag.findMany.mockResolvedValue([{ key: 'study-room', enabled: false }]);
            const row = await service.toggle('study-room', false, { adminId: 'a1' });
            expect(prisma.pageFeatureFlag.upsert).toHaveBeenCalledWith({
                where: { key: 'study-room' },
                update: { enabled: false },
                create: { key: 'study-room', label: 'Phòng học chung', enabled: false },
            });
            expect(row.enabled).toBe(false);
            expect(gateway.setPageFlags).toHaveBeenCalledWith({ 'study-room': false });
            expect(prisma.adminAudit.create).toHaveBeenCalledTimes(1);
        });

        it('concurrent toggles: the LAST push to the gateway is the final DB state, never an older map', async () => {
            const { service, prisma, gateway } = make();
            const state: Record<string, boolean> = {};
            prisma.pageFeatureFlag.upsert.mockImplementation(async ({ where, update }: any) => {
                // the second admin's write lands while the first one's (slow) read is in flight
                if (where.key === 'flash-card') await new Promise((r) => setTimeout(r, 10));
                state[where.key] = update.enabled;
                return { key: where.key, label: 'x', enabled: update.enabled, updatedAt: new Date() };
            });
            let reads = 0;
            prisma.pageFeatureFlag.findMany.mockImplementation(async () => {
                const snapshot = Object.entries(state).map(([key, enabled]) => ({ key, enabled }));
                // the first read is slow: its (older) snapshot would land after the second push
                if (++reads === 1) await new Promise((r) => setTimeout(r, 30));
                return snapshot;
            });
            await Promise.all([
                service.toggle('study-room', false, { adminId: 'a1' }),
                service.toggle('flash-card', false, { adminId: 'a2' }),
            ]);
            const calls = gateway.setPageFlags.mock.calls;
            expect(calls[calls.length - 1][0]).toEqual({ 'study-room': false, 'flash-card': false });
        });

        it('a failed push does not poison the next one', async () => {
            const { service, prisma, gateway } = make();
            prisma.pageFeatureFlag.upsert.mockResolvedValue({ key: 'study-room', label: 'x', enabled: false, updatedAt: new Date() });
            gateway.setPageFlags.mockRejectedValueOnce(new Error('gateway unavailable'));
            await expect(service.toggle('study-room', false, { adminId: 'a1' })).rejects.toThrow('gateway unavailable');
            await expect(service.toggle('study-room', false, { adminId: 'a1' })).resolves.toBeDefined();
        });

        it('gateway down: the DB write and the audit row stay, the error reaches the admin so they can retry', async () => {
            const { service, prisma, gateway } = make();
            prisma.pageFeatureFlag.upsert.mockResolvedValue({ key: 'study-room', label: 'x', enabled: false, updatedAt: new Date() });
            gateway.setPageFlags.mockRejectedValue(new Error('gateway unavailable'));
            await expect(service.toggle('study-room', false, { adminId: 'a1' })).rejects.toThrow('gateway unavailable');
            expect(prisma.pageFeatureFlag.upsert).toHaveBeenCalledTimes(1);
            expect(prisma.adminAudit.create).toHaveBeenCalledTimes(1);
        });
    });
});
