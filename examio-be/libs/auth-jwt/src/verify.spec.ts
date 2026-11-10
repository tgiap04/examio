import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { SignJWT, generateKeyPair } from 'jose';
import { createTokenVerifier } from './verify';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    serviceClaims,
    signTestToken,
    type TestKeyPair,
} from './testing';
import { TokenVerificationError } from './auth-errors';

const base = { issuer: TEST_ISSUER, audiences: [TEST_AUDIENCE, 'finance'] };

async function code(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;
    } catch (err) {
        if (err instanceof TokenVerificationError) return err.code;
        throw err;
    }
    return 'OK';
}

describe('createTokenVerifier (local JWKS)', () => {
    let keys: TestKeyPair;
    let verify: ReturnType<typeof createTokenVerifier>;

    beforeAll(async () => {
        keys = await createTestKeyPair('k1');
        verify = createTokenVerifier({
            ...base,
            localJwks: { keys: [keys.publicJwk] },
        });
    });

    it('returns an AuthUser for a valid user token', async () => {
        const token = await signTestToken(keys, {
            claims: { roles: ['TEACHER', 'SYSTEM_ADMIN'], av: 3, sid: 's9' },
        });
        await expect(verify(token)).resolves.toEqual({
            kind: 'user',
            id: 'user-1',
            sid: 's9',
            roles: ['TEACHER', 'SYSTEM_ADMIN'],
            emailVerified: true,
            av: 3,
        });
    });

    it('accepts the service audience and returns a ServiceCaller', async () => {
        const token = await signTestToken(keys, {
            claims: serviceClaims('exam'),
            audience: 'finance',
        });
        await expect(verify(token)).resolves.toEqual({
            kind: 'service',
            name: 'exam',
        });
    });

    it('rejects an expired token as TOKEN_EXPIRED', async () => {
        const token = await signTestToken(keys, { expiresInSeconds: -60 });
        expect(await code(verify(token))).toBe('TOKEN_EXPIRED');
    });

    it('rejects a wrong audience, issuer and typ', async () => {
        expect(
            await code(verify(await signTestToken(keys, { audience: 'other' })))
        ).toBe('TOKEN_INVALID');
        expect(
            await code(verify(await signTestToken(keys, { issuer: 'evil' })))
        ).toBe('TOKEN_INVALID');
        expect(
            await code(verify(await signTestToken(keys, { typ: 'JWT' })))
        ).toBe('TOKEN_INVALID');
    });

    it('rejects HS256, alg none, garbage and a foreign signature', async () => {
        const hs = await new SignJWT({ sid: 's', roles: ['STUDENT'], av: 0, email_verified: true })
            .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt', kid: 'k1' })
            .setIssuer(TEST_ISSUER)
            .setAudience(TEST_AUDIENCE)
            .setSubject('u')
            .setExpirationTime('5m')
            .sign(new TextEncoder().encode('x'.repeat(40)));
        expect(await code(verify(hs))).toBe('TOKEN_INVALID');

        const none = [
            Buffer.from('{"alg":"none","typ":"at+jwt","kid":"k1"}').toString('base64url'),
            Buffer.from(
                JSON.stringify({ sub: 'u', iss: TEST_ISSUER, aud: TEST_AUDIENCE, sid: 's', roles: ['SYSTEM_ADMIN'], av: 0, email_verified: true, exp: 9999999999 })
            ).toString('base64url'),
            '',
        ].join('.');
        expect(await code(verify(none))).toBe('TOKEN_INVALID');
        expect(await code(verify('not-a-jwt'))).toBe('TOKEN_INVALID');

        const other = await generateKeyPair('RS256');
        const forged = await new SignJWT({ sid: 's', roles: ['SYSTEM_ADMIN'], av: 0, email_verified: true })
            .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: 'k1' })
            .setIssuer(TEST_ISSUER)
            .setAudience(TEST_AUDIENCE)
            .setSubject('u')
            .setExpirationTime('5m')
            .sign(other.privateKey);
        expect(await code(verify(forged))).toBe('TOKEN_INVALID');
    });

    it('rejects a correctly signed token that has no exp or no iat (never-expiring tokens)', async () => {
        const unsigned = (build: (j: SignJWT) => SignJWT) =>
            build(
                new SignJWT({ sid: 's', roles: ['SYSTEM_ADMIN'], av: 0, email_verified: true })
                    .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: 'k1' })
                    .setIssuer(TEST_ISSUER)
                    .setAudience(TEST_AUDIENCE)
                    .setSubject('u')
            ).sign(keys.privateKey);
        const now = Math.floor(Date.now() / 1000);
        expect(await code(verify(await unsigned((j) => j.setIssuedAt(now))))).toBe('TOKEN_INVALID');
        expect(await code(verify(await unsigned((j) => j.setExpirationTime(now + 300))))).toBe('TOKEN_INVALID');
        expect(await code(verify(await unsigned((j) => j)))).toBe('TOKEN_INVALID');
        expect(
            await code(verify(await unsigned((j) => j.setIssuedAt(now).setExpirationTime(now + 300))))
        ).toBe('OK');
    });

    it('rejects an unknown kid', async () => {
        const stranger = await createTestKeyPair('unknown');
        expect(await code(verify(await signTestToken(stranger)))).toBe(
            'TOKEN_INVALID'
        );
    });

    it('rejects SERVICE/sub mismatches in both directions', async () => {
        const a = await signTestToken(keys, {
            claims: { roles: ['SERVICE'], sub: 'user-1' },
        });
        const b = await signTestToken(keys, {
            claims: { roles: ['STUDENT'], sub: 'svc:exam' },
        });
        const c = await signTestToken(keys, {
            claims: { roles: ['SERVICE', 'SYSTEM_ADMIN'], sub: 'svc:exam' },
        });
        expect(await code(verify(a))).toBe('TOKEN_INVALID');
        expect(await code(verify(b))).toBe('TOKEN_INVALID');
        expect(await code(verify(c))).toBe('TOKEN_INVALID');
    });

    it('rejects malformed claims', async () => {
        for (const claims of [
            { roles: [] },
            { roles: 'STUDENT' },
            { roles: ['GOD'] },
            { sid: 5 },
            { av: 'x' },
            { av: -1 },
            { email_verified: 'yes' },
        ]) {
            expect(
                await code(verify(await signTestToken(keys, { claims })))
            ).toBe('TOKEN_INVALID');
        }
    });

    it('verifies with a retired key still published (kid rotation, local)', async () => {
        const retired = await createTestKeyPair('old');
        const v = createTokenVerifier({
            ...base,
            localJwks: { keys: [keys.publicJwk, retired.publicJwk] },
        });
        expect(await code(v(await signTestToken(retired)))).toBe('OK');
        expect(await code(v(await signTestToken(keys)))).toBe('OK');
    });
});

describe('createTokenVerifier (remote JWKS, rotation)', () => {
    let server: Server;
    let url: string;
    let published: unknown[] = [];
    let hits = 0;

    beforeAll(async () => {
        server = createServer((_req, res) => {
            hits++;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ keys: published }));
        });
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks`;
    });
    afterAll(async () => {
        await new Promise((r) => server.close(r));
    });

    it('fetches once, caches, and picks up a rotated kid', async () => {
        const k1 = await createTestKeyPair('k1');
        const k2 = await createTestKeyPair('k2');
        published = [k1.publicJwk];
        const verify = createTokenVerifier({
            ...base,
            jwksUrl: url,
            cooldownMs: 0,
        });

        expect(await code(verify(await signTestToken(k1)))).toBe('OK');
        expect(await code(verify(await signTestToken(k1)))).toBe('OK');
        expect(hits).toBe(1);

        // Rotation: new key published, old kept for in-flight tokens.
        published = [k2.publicJwk, k1.publicJwk];
        expect(await code(verify(await signTestToken(k2)))).toBe('OK');
        expect(await code(verify(await signTestToken(k1)))).toBe('OK');

        // A kid that was never published still fails after the refetch.
        const stranger = await createTestKeyPair('k3');
        const before = hits;
        expect(await code(verify(await signTestToken(stranger)))).toBe(
            'TOKEN_INVALID'
        );
        expect(hits).toBe(before + 1);
    });

    it('maps an unreachable JWKS endpoint to TOKEN_INVALID (never a 500)', async () => {
        const k = await createTestKeyPair('k');
        const verify = createTokenVerifier({
            ...base,
            jwksUrl: 'http://127.0.0.1:1/jwks',
            cooldownMs: 0,
        });
        expect(await code(verify(await signTestToken(k)))).toBe('TOKEN_INVALID');
    });
});
