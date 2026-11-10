import { HttpException } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { AdminAuditService } from './admin-audit.service';

const md = new Metadata();
md.set('authorization', 'Bearer admin-token');
const q = (over: Record<string, unknown> = {}) => ({ page: 1, pageSize: 20, ...over }) as never;

const row = (id: string, adminId: string, action = 'admin.user.update') => ({
    id, adminId, action, targetId: 'u1', payload: { field: 'name' }, reason: null, createdAt: new Date('2026-03-15T00:00:00Z'),
});

function setup(rows = [row('a1', 'adm-1'), row('a2', 'adm-2'), row('a3', 'adm-1')]) {
    const prisma = {
        adminAudit: { findMany: jest.fn(async () => rows), count: jest.fn(async () => rows.length) },
        $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
    };
    const auth = {
        getUsersByIds: jest.fn(async () => ({ users: [{ id: 'adm-1', username: 'root', name: '' }, { id: 'adm-2', username: 'ops', name: '' }] })),
    };
    return { service: new AdminAuditService(prisma as never, auth as never), prisma, auth };
}

describe('AdminAuditService.listAudit', () => {
    it('reads only AdminAudit (no User relation include) and resolves actor names with ONE auth call for the distinct ids', async () => {
        const { service, prisma, auth } = setup();
        const res = await service.listAudit(q(), md);
        const args = prisma.adminAudit.findMany.mock.calls[0] as unknown as [Record<string, unknown>];
        expect(args[0]).not.toHaveProperty('include');
        expect(auth.getUsersByIds).toHaveBeenCalledTimes(1);
        expect(auth.getUsersByIds).toHaveBeenCalledWith(['adm-1', 'adm-2'], md);
        expect(res.rows.map((r) => r.actorName)).toEqual(['root', 'ops', 'root']);
        expect(res).toMatchObject({ total: 3, page: 1, pageSize: 20 });
        expect(res.rows[0]).toMatchObject({ id: 'a1', targetType: 'user', metadata: { field: 'name' }, createdAt: '2026-03-15T00:00:00.000Z' });
    });

    it('labels an actor with name when set, else username (same rule as the FE admin dropdown)', async () => {
        const { service, auth } = setup();
        auth.getUsersByIds.mockResolvedValueOnce({
            users: [
                { id: 'adm-1', username: 'root', name: 'Root Admin' },
                { id: 'adm-2', username: 'ops', name: '' },
            ],
        });
        expect((await service.listAudit(q(), md)).rows.map((r) => r.actorName)).toEqual(['Root Admin', 'ops', 'Root Admin']);
    });

    it('keeps actorId as the string admin id (cuid), never NaN/null', async () => {
        const { service } = setup([row('a1', 'cmabc123xyz')]);
        const res = await service.listAudit(q(), md);
        expect(res.rows[0].actorId).toBe('cmabc123xyz');
        expect(JSON.parse(JSON.stringify(res.rows[0])).actorId).toBe('cmabc123xyz');
    });

    it('a deleted admin or a failed name lookup falls back to #<id>; the audit list still loads', async () => {
        const { service, auth } = setup();
        auth.getUsersByIds.mockResolvedValueOnce({ users: [{ id: 'adm-1', username: 'root', name: '' }] });
        expect((await service.listAudit(q(), md)).rows.map((r) => r.actorName)).toEqual(['root', '#adm-2', 'root']);
        auth.getUsersByIds.mockRejectedValueOnce(new HttpException({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' }, 503));
        expect((await service.listAudit(q(), md)).rows.map((r) => r.actorName)).toEqual(['#adm-1', '#adm-2', '#adm-1']);
    });

    it('makes no auth call for an empty page; filters still reach the where clause', async () => {
        const { service, prisma, auth } = setup([]);
        await service.listAudit(q({ adminId: 'adm-1', action: 'admin.user' }), md);
        expect(auth.getUsersByIds).not.toHaveBeenCalled();
        expect((prisma.adminAudit.findMany.mock.calls[0] as unknown as [{ where: unknown }])[0].where).toMatchObject({
            adminId: 'adm-1', action: { contains: 'admin.user', mode: 'insensitive' },
        });
    });
});
