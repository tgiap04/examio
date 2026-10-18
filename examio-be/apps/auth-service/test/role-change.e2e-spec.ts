import { HttpException } from '@nestjs/common';
import { RoleChangeService } from '../src/roles/role-change.service';
import { AccessTokenService } from '../src/token/access-token.service';
import { AuthApp, bootAuthApp, decodeClaims, registerUser, uniq } from './helpers/auth-app';

describe('role change (e2e, real Postgres)', () => {
    let ctx: AuthApp;
    let roles: RoleChangeService;
    let tokens: AccessTokenService;

    beforeAll(async () => {
        ctx = await bootAuthApp();
        roles = ctx.app.get(RoleChangeService, { strict: false });
        tokens = ctx.app.get(AccessTokenService, { strict: false });
    });
    afterAll(() => ctx.close());

    const cli = { kind: 'system', email: 'e2e@system' } as const;
    const code = async (p: Promise<unknown>) => {
        try {
            await p;
            return 'ok';
        } catch (e) {
            return e instanceof HttpException ? (e.getResponse() as { code: string }).code : String(e);
        }
    };

    async function newUser(over: Record<string, unknown> = {}) {
        const u = await registerUser(ctx);
        if (Object.keys(over).length) await ctx.prisma.user.update({ where: { id: u.id }, data: over });
        return u;
    }

    /** Leave exactly the given users as the active admins (other suites' admins are demoted). */
    async function onlyAdmins(...ids: string[]) {
        await ctx.prisma.user.updateMany({ where: { isSystemAdmin: true, id: { notIn: ids } }, data: { isSystemAdmin: false } });
        await ctx.prisma.user.updateMany({ where: { id: { in: ids } }, data: { isSystemAdmin: true, isBanned: false } });
    }

    const authzEvents = (userId: string) =>
        ctx.prisma.outboxEvent.findMany({
            where: { type: 'auth.user.authz_changed', envelope: { path: ['data', 'userId'], equals: userId } },
            orderBy: { seq: 'asc' },
        });

    it('demoting a TEACHER touches only role/authzVersion: content, ownership and open sessions are untouched', async () => {
        const teacher = await newUser({ role: 'TEACHER' });
        const admin = await newUser({ isSystemAdmin: true });
        const quiz = await ctx.prisma.quizSet.create({ data: { title: 'Q', userId: teacher.id } });
        const flash = await ctx.prisma.flashCardSet.create({ data: { title: 'F', userId: teacher.id } });
        const room = await ctx.prisma.examRoom.create({ data: { title: 'R', quizSetId: quiz.id, hostId: teacher.id } });
        const session = await ctx.prisma.examSession.create({
            data: { examRoomId: room.id, status: 1, startTime: new Date(Date.now() - 60_000) },
        });
        const wallet = await ctx.prisma.wallet.create({ data: { id: uniq('w'), userId: teacher.id, balance: 20 } });

        const snapshot = async () => ({
            quiz: await ctx.prisma.quizSet.findMany({ where: { userId: teacher.id }, select: { id: true, userId: true, title: true } }),
            flash: await ctx.prisma.flashCardSet.findMany({ where: { userId: teacher.id }, select: { id: true, userId: true, title: true } }),
            rooms: await ctx.prisma.examRoom.findMany({ where: { hostId: teacher.id }, select: { id: true, hostId: true } }),
            sessions: await ctx.prisma.examSession.findMany({ where: { examRoomId: room.id }, select: { id: true, status: true, endTime: true } }),
            wallet: await ctx.prisma.wallet.findUnique({ where: { id: wallet.id }, select: { id: true, userId: true, balance: true } }),
        });
        const before = await snapshot();
        const userBefore = await ctx.prisma.user.findUniqueOrThrow({ where: { id: teacher.id } });

        const result = await roles.change({
            actor: { kind: 'user', userId: admin.id }, targetUserId: teacher.id, role: 'STUDENT', source: 'admin-ui', reason: 'demote',
        });
        expect(result.changed).toBe(true);

        expect(await snapshot()).toEqual(before);
        expect(session.id).toBe(before.sessions[0].id);
        const userAfter = await ctx.prisma.user.findUniqueOrThrow({ where: { id: teacher.id } });
        expect(userAfter.role).toBe('STUDENT');
        expect(userAfter.authzVersion).toBe(userBefore.authzVersion + 1);
        // Everything else on the row is as it was.
        const { role: _r, authzVersion: _a, updatedAt: _u, ...restAfter } = userAfter;
        const { role: _r0, authzVersion: _a0, updatedAt: _u0, ...restBefore } = userBefore;
        expect(restAfter).toEqual(restBefore);
        expect(flash.id).toBeDefined();
    });

    it('success writes one RoleChangeLog row and exactly one authz_changed event (role, flags, version = av)', async () => {
        const target = await newUser();
        const admin = await newUser({ isSystemAdmin: true });
        await roles.change({ actor: { kind: 'user', userId: admin.id }, targetUserId: target.id, role: 'TEACHER', source: 'admin-ui', reason: 'why' });

        const logs = await ctx.prisma.roleChangeLog.findMany({ where: { targetUserId: target.id } });
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
            actorUserId: admin.id, actorEmail: admin.email, targetEmail: target.email,
            fromRole: 'STUDENT', toRole: 'TEACHER', fromAdmin: false, toAdmin: false, reason: 'why', source: 'admin-ui',
        });
        const events = await authzEvents(target.id);
        expect(events).toHaveLength(1);
        expect((events[0].envelope as { data: unknown }).data).toEqual({
            userId: target.id, authzVersion: 1, role: 'TEACHER', isSystemAdmin: false, isBanned: false, reason: 'role', version: 1,
        });
    });

    it('re-apply writes a log + authz_changed(reapply) with an UNCHANGED authzVersion and no user update', async () => {
        const target = await newUser({ role: 'TEACHER', authzVersion: 4 });
        const before = await ctx.prisma.user.findUniqueOrThrow({ where: { id: target.id } });
        const result = await roles.change({ actor: cli, targetUserId: target.id, role: 'TEACHER', source: 'cli' });
        expect(result.changed).toBe(false);
        const after = await ctx.prisma.user.findUniqueOrThrow({ where: { id: target.id } });
        expect(after.authzVersion).toBe(4);
        expect(after.updatedAt).toEqual(before.updatedAt);
        const [log] = await ctx.prisma.roleChangeLog.findMany({ where: { targetUserId: target.id } });
        expect(log).toMatchObject({ reason: 'reapply', actorUserId: null, actorEmail: 'e2e@system', source: 'cli' });
        const events = await authzEvents(target.id);
        expect(events).toHaveLength(1);
        expect((events[0].envelope as { data: Record<string, unknown> }).data).toMatchObject({
            reason: 'reapply', role: 'TEACHER', authzVersion: 4, version: 4,
        });
    });

    it('blocks self-change, non-admin actors, banned admin actors and unknown targets', async () => {
        const admin = await newUser({ isSystemAdmin: true });
        const plain = await newUser();
        const bannedAdmin = await newUser({ isSystemAdmin: true, isBanned: true });
        const target = await newUser();
        const ask = (actorId: string, targetUserId: string) =>
            code(roles.change({ actor: { kind: 'user', userId: actorId }, targetUserId, role: 'TEACHER', source: 'admin-ui' }));
        expect(await ask(admin.id, admin.id)).toBe('CANNOT_CHANGE_OWN_ROLE');
        expect(await ask(plain.id, target.id)).toBe('PERMISSION_DENIED');
        expect(await ask(bannedAdmin.id, target.id)).toBe('PERMISSION_DENIED');
        expect(await ask(admin.id, 'no-such-user')).toBe('USER_NOT_FOUND');
        expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe('STUDENT');
    });

    it('the last active SYSTEM_ADMIN cannot be demoted (409 LAST_SYSTEM_ADMIN)', async () => {
        const sole = await newUser();
        await onlyAdmins(sole.id);
        expect(await code(roles.change({ actor: cli, targetUserId: sole.id, isSystemAdmin: false, source: 'cli' }))).toBe('LAST_SYSTEM_ADMIN');
        expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: sole.id } })).isSystemAdmin).toBe(true);
    });

    it('two concurrent demotions of the last two admins: exactly one succeeds (advisory lock), 409 for the other', async () => {
        for (let round = 0; round < 5; round++) {
            const a = await newUser();
            const b = await newUser();
            await onlyAdmins(a.id, b.id);
            const results = await Promise.all([
                code(roles.change({ actor: cli, targetUserId: a.id, isSystemAdmin: false, source: 'cli' })),
                code(roles.change({ actor: cli, targetUserId: b.id, isSystemAdmin: false, source: 'cli' })),
            ]);
            expect(results.filter((r) => r === 'ok')).toHaveLength(1);
            expect(results.filter((r) => r === 'LAST_SYSTEM_ADMIN' || r === 'ROLE_CHANGE_CONFLICT')).toHaveLength(1);
            expect(await ctx.prisma.user.count({ where: { isSystemAdmin: true, isBanned: false, deletedAt: null } })).toBe(1);
        }
    });

    it('admins demoting each other concurrently: exactly one succeeds (the loser is no longer an admin)', async () => {
        const a = await newUser();
        const b = await newUser();
        await onlyAdmins(a.id, b.id);
        const results = await Promise.all([
            code(roles.change({ actor: { kind: 'user', userId: a.id }, targetUserId: b.id, isSystemAdmin: false, source: 'admin-ui' })),
            code(roles.change({ actor: { kind: 'user', userId: b.id }, targetUserId: a.id, isSystemAdmin: false, source: 'admin-ui' })),
        ]);
        expect(results.filter((r) => r === 'ok')).toHaveLength(1);
        expect(await ctx.prisma.user.count({ where: { isSystemAdmin: true, deletedAt: null } })).toBe(1);
    });

    it('a demotion racing a refresh never yields a token mixing old roles with the new av (or vice versa)', async () => {
        const target = await newUser({ role: 'TEACHER' });
        const sid = 'race-session';
        let expectedRole: 'STUDENT' | 'TEACHER' = 'TEACHER';
        for (let i = 0; i < 25; i++) {
            const base = (await ctx.prisma.user.findUniqueOrThrow({ where: { id: target.id } })).authzVersion;
            const next = expectedRole === 'TEACHER' ? 'STUDENT' : 'TEACHER';
            const [issued] = await Promise.all([
                tokens.issue(target.id, sid),
                roles.change({ actor: cli, targetUserId: target.id, role: next, source: 'cli' }),
            ]);
            const claims = decodeClaims(issued.token);
            const oldPair = claims.roles?.toString() === expectedRole && claims.av === base;
            const newPair = claims.roles?.toString() === next && claims.av === base + 1;
            expect(oldPair || newPair).toBe(true);
            expectedRole = next;
        }
    });
});
