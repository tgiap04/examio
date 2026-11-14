import 'reflect-metadata';
import { Metadata } from '@grpc/grpc-js';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import {
    AllowUnverified,
    Authenticated,
    Public,
    RequirePermissions,
    RequirePermissionsOrService,
    ServiceOnly,
} from './decorators';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { createTokenVerifier } from './verify';
import { getPrincipal } from './principal';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    serviceClaims,
    signTestToken,
    type TestKeyPair,
} from './testing';
import { SignJWT } from 'jose';

class Sample {
    undeclared() {}
    @Public() pub() {}
    @Authenticated() auth() {}
    @Authenticated() @AllowUnverified() authUnverified() {}
    @RequirePermissions('quizset:manage') manage() {}
    @RequirePermissions('quizset:manage', 'ai:generate') both() {}
    @ServiceOnly('exam') examOnly() {}
    @RequirePermissionsOrService(['user:manage'], { callers: ['admin'] })
    userManage() {}
    @RequirePermissionsOrService([]) anyVerifiedOrService() {}
    @RequirePermissionsOrService(['user:manage']) anyServiceCaller() {}
}

@Authenticated()
class ClassLevel {
    inherits() {}
    @RequirePermissions('role:assign') override() {}
}

interface Fake {
    ctx: ExecutionContext;
    req: { headers: Record<string, string>; user?: unknown };
    md: Metadata;
}

function fakeCtx(
    klass: new () => object,
    handler: string,
    opts: { type?: string; headers?: Record<string, string>; md?: Metadata } = {}
): Fake {
    const req = { headers: opts.headers ?? {}, user: undefined as unknown };
    const md = opts.md ?? new Metadata();
    const ctx = {
        getType: () => opts.type ?? 'http',
        getClass: () => klass,
        getHandler: () => (klass.prototype as Record<string, () => void>)[handler],
        switchToHttp: () => ({ getRequest: () => req }),
        switchToRpc: () => ({ getContext: () => md, getData: () => ({}) }),
    } as unknown as ExecutionContext;
    return { ctx, req, md };
}

describe('JwtAuthGuard + PermissionsGuard', () => {
    let keys: TestKeyPair;
    let jwt: JwtAuthGuard;
    let perms: PermissionsGuard;

    beforeAll(async () => {
        keys = await createTestKeyPair('k1');
        const verifier = createTokenVerifier({
            issuer: TEST_ISSUER,
            audiences: [TEST_AUDIENCE, 'finance'],
            localJwks: { keys: [keys.publicJwk] },
        });
        const reflector = new Reflector();
        jwt = new JwtAuthGuard(reflector, verifier);
        perms = new PermissionsGuard(reflector);
    });

    async function outcome(f: Fake): Promise<string> {
        try {
            await jwt.canActivate(f.ctx);
            await perms.canActivate(f.ctx);
            return 'pass';
        } catch (err) {
            const body = (err as { getResponse?: () => { code?: string } })
                .getResponse?.();
            if (body?.code) {
                return `${(err as { getStatus(): number }).getStatus()} ${body.code}`;
            }
            if (err instanceof RpcException) {
                const e = err.getError() as { code: number; message: string };
                return `rpc ${status[e.code]} ${e.message}`;
            }
            throw err;
        }
    }
    const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
    const asUser = async (
        claims: Record<string, unknown> = {},
        o: Parameters<typeof signTestToken>[1] = {}
    ) => bearer(await signTestToken(keys, { ...o, claims }));
    const asService = async (name: string, audience = 'finance') =>
        bearer(
            await signTestToken(keys, { claims: serviceClaims(name), audience })
        );

    it('denies by default: no declaration -> 403 NO_AUTHZ_DECLARED', async () => {
        const f = fakeCtx(Sample, 'undeclared', { headers: await asUser() });
        expect(await outcome(f)).toBe('403 NO_AUTHZ_DECLARED');
    });

    it('missing token on a protected route -> 401 TOKEN_MISSING', async () => {
        expect(await outcome(fakeCtx(Sample, 'auth'))).toBe('401 TOKEN_MISSING');
        expect(await outcome(fakeCtx(Sample, 'manage'))).toBe(
            '401 TOKEN_MISSING'
        );
    });

    it('@Public passes anonymously, also with a bad or expired token', async () => {
        const anon = fakeCtx(Sample, 'pub');
        expect(await outcome(anon)).toBe('pass');
        expect(anon.req.user).toBeUndefined();

        const bad = fakeCtx(Sample, 'pub', { headers: bearer('garbage') });
        expect(await outcome(bad)).toBe('pass');
        expect(bad.req.user).toBeUndefined();

        const expired = fakeCtx(Sample, 'pub', {
            headers: await asUser({}, { expiresInSeconds: -60 }),
        });
        expect(await outcome(expired)).toBe('pass');
        expect(expired.req.user).toBeUndefined();
    });

    it('@Public attaches the user when the token is valid', async () => {
        const f = fakeCtx(Sample, 'pub', { headers: await asUser() });
        expect(await outcome(f)).toBe('pass');
        expect(f.req.user).toMatchObject({ kind: 'user', id: 'user-1' });
    });

    it('rejects expired, HS256, none and wrong-audience tokens with 401', async () => {
        expect(
            await outcome(
                fakeCtx(Sample, 'auth', {
                    headers: await asUser({}, { expiresInSeconds: -60 }),
                })
            )
        ).toBe('401 TOKEN_EXPIRED');

        const hs = await new SignJWT({ sid: 's', roles: ['SYSTEM_ADMIN'], av: 0, email_verified: true })
            .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
            .setIssuer(TEST_ISSUER)
            .setAudience(TEST_AUDIENCE)
            .setSubject('u')
            .setExpirationTime('5m')
            .sign(new TextEncoder().encode('s'.repeat(40)));
        expect(await outcome(fakeCtx(Sample, 'auth', { headers: bearer(hs) }))).toBe(
            '401 TOKEN_INVALID'
        );

        const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"u"}').toString('base64url')}.`;
        expect(
            await outcome(fakeCtx(Sample, 'auth', { headers: bearer(none) }))
        ).toBe('401 TOKEN_INVALID');

        expect(
            await outcome(
                fakeCtx(Sample, 'auth', {
                    headers: await asUser({}, { audience: 'someone-else' }),
                })
            )
        ).toBe('401 TOKEN_INVALID');
    });

    it('@Authenticated denies unverified users unless @AllowUnverified', async () => {
        const headers = await asUser({ email_verified: false });
        expect(await outcome(fakeCtx(Sample, 'auth', { headers }))).toBe(
            '403 EMAIL_NOT_VERIFIED'
        );
        expect(
            await outcome(fakeCtx(Sample, 'authUnverified', { headers }))
        ).toBe('pass');
        expect(await outcome(fakeCtx(Sample, 'manage', { headers: await asUser({ email_verified: false, roles: ['TEACHER'] }) }))).toBe('403 EMAIL_NOT_VERIFIED');
    });

    it('@RequirePermissions checks every permission (AND)', async () => {
        const teacher = await asUser({ roles: ['TEACHER'] });
        const student = await asUser({ roles: ['STUDENT'] });
        const admin = await asUser({ roles: ['SYSTEM_ADMIN'] });
        expect(await outcome(fakeCtx(Sample, 'manage', { headers: teacher }))).toBe('pass');
        expect(await outcome(fakeCtx(Sample, 'both', { headers: teacher }))).toBe('pass');
        expect(await outcome(fakeCtx(Sample, 'manage', { headers: student }))).toBe('403 PERMISSION_DENIED');
        // SYSTEM_ADMIN carries every TEACHER permission too.
        expect(await outcome(fakeCtx(Sample, 'manage', { headers: admin }))).toBe('pass');
        const both = await asUser({ roles: ['TEACHER', 'SYSTEM_ADMIN'] });
        expect(await outcome(fakeCtx(Sample, 'manage', { headers: both }))).toBe('pass');
    });

    it('rejects service tokens on user-only declarations', async () => {
        const svc = await asService('exam');
        expect(await outcome(fakeCtx(Sample, 'manage', { headers: svc }))).toBe('403 PERMISSION_DENIED');
        expect(await outcome(fakeCtx(Sample, 'auth', { headers: svc }))).toBe('403 PERMISSION_DENIED');
    });

    it('@ServiceOnly accepts only the listed callers', async () => {
        expect(await outcome(fakeCtx(Sample, 'examOnly', { headers: await asService('exam') }))).toBe('pass');
        expect(await outcome(fakeCtx(Sample, 'examOnly', { headers: await asService('finance') }))).toBe('403 PERMISSION_DENIED');
        expect(await outcome(fakeCtx(Sample, 'examOnly', { headers: await asUser({ roles: ['SYSTEM_ADMIN'] }) }))).toBe('403 PERMISSION_DENIED');
    });

    it('@RequirePermissionsOrService: user with perms, allowlisted service, nobody else', async () => {
        const f = (h: Record<string, string>) => fakeCtx(Sample, 'userManage', { headers: h });
        expect(await outcome(f(await asUser({ roles: ['STUDENT'] })))).toBe('403 PERMISSION_DENIED');
        expect(await outcome(f(await asUser({ roles: ['SYSTEM_ADMIN'] })))).toBe('pass');
        expect(await outcome(f(await asService('admin')))).toBe('pass');
        expect(await outcome(f(await asService('exam')))).toBe('403 PERMISSION_DENIED');
    });

    it('@RequirePermissionsOrService: empty perms = any verified user; omitted callers = any service', async () => {
        const any = (h: Record<string, string>) => fakeCtx(Sample, 'anyVerifiedOrService', { headers: h });
        expect(await outcome(any(await asUser()))).toBe('pass');
        expect(await outcome(any(await asUser({ email_verified: false })))).toBe('403 EMAIL_NOT_VERIFIED');
        expect(await outcome(any(await asService('whatever')))).toBe('pass');
        const open = (h: Record<string, string>) => fakeCtx(Sample, 'anyServiceCaller', { headers: h });
        expect(await outcome(open(await asService('random')))).toBe('pass');
        expect(await outcome(open(await asUser({ roles: ['STUDENT'] })))).toBe('403 PERMISSION_DENIED');
    });

    it('rejects a SERVICE-role token whose sub is not svc:*', async () => {
        const headers = await asUser({ roles: ['SERVICE'], sub: 'user-1' });
        expect(await outcome(fakeCtx(Sample, 'examOnly', { headers }))).toBe('401 TOKEN_INVALID');
    });

    it('handler declarations override class declarations', async () => {
        const student = await asUser({ roles: ['STUDENT'] });
        expect(await outcome(fakeCtx(ClassLevel, 'inherits', { headers: student }))).toBe('pass');
        expect(await outcome(fakeCtx(ClassLevel, 'override', { headers: student }))).toBe('403 PERMISSION_DENIED');
    });

    it('skips ws contexts without reading any token', async () => {
        const f = fakeCtx(Sample, 'undeclared', { type: 'ws' });
        const spy = jest.spyOn(f.ctx, 'switchToHttp');
        await expect(jwt.canActivate(f.ctx)).resolves.toBe(true);
        expect(perms.canActivate(f.ctx)).toBe(true);
        expect(spy).not.toHaveBeenCalled();
    });

    describe('rpc context', () => {
        const rpc = (handler: string, md: Metadata) =>
            fakeCtx(Sample, handler, { type: 'rpc', md });

        it('reads the bearer token from metadata and exposes the principal', async () => {
            const md = new Metadata();
            md.set('authorization', `Bearer ${await signTestToken(keys, { claims: { roles: ['TEACHER'] } })}`);
            const f = rpc('manage', md);
            expect(await outcome(f)).toBe('pass');
            expect(getPrincipal(f.ctx)).toMatchObject({ kind: 'user', id: 'user-1' });
        });

        it('no metadata -> UNAUTHENTICATED TOKEN_MISSING', async () => {
            expect(await outcome(rpc('examOnly', new Metadata()))).toBe('rpc UNAUTHENTICATED TOKEN_MISSING');
        });

        it('wrong caller -> PERMISSION_DENIED; right caller passes', async () => {
            const bad = new Metadata();
            bad.set('authorization', `Bearer ${await signTestToken(keys, { claims: serviceClaims('finance'), audience: 'finance' })}`);
            expect(await outcome(rpc('examOnly', bad))).toBe('rpc PERMISSION_DENIED PERMISSION_DENIED');
            const ok = new Metadata();
            ok.set('authorization', `Bearer ${await signTestToken(keys, { claims: serviceClaims('exam'), audience: 'finance' })}`);
            expect(await outcome(rpc('examOnly', ok))).toBe('pass');
        });

        it('bad token -> UNAUTHENTICATED TOKEN_INVALID', async () => {
            const md = new Metadata();
            md.set('authorization', 'Bearer nope');
            expect(await outcome(rpc('auth', md))).toBe('rpc UNAUTHENTICATED TOKEN_INVALID');
        });
    });
});

describe('decorator argument validation', () => {
    it('@ServiceOnly requires at least one caller', () => {
        expect(() => ServiceOnly()).toThrow(/at least one/);
    });
});
