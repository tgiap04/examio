import { generateKeyPairSync } from 'crypto';
import { TokenService } from './token.service';

function service(env: Record<string, string> = {}) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    Object.assign(process.env, {
        JWT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        JWT_KID: 'kid-1',
        JWT_ISSUER: 'examio-auth',
        JWT_AUDIENCE: 'examio',
        ...env,
    });
    return new TokenService();
}

describe('TokenService', () => {
    afterEach(() => {
        for (const k of ['JWT_PRIVATE_KEY', 'JWT_KID', 'JWT_ISSUER', 'JWT_AUDIENCE']) delete process.env[k];
    });

    it('signs a user token the local verifier accepts, with all claims and a 15m expiry', async () => {
        const svc = service();
        const { token, expiresInSeconds } = await svc.signUserToken({
            userId: 'u1',
            sessionId: 's1',
            roles: ['TEACHER', 'SYSTEM_ADMIN'],
            emailVerified: true,
            authzVersion: 7,
        });
        expect(expiresInSeconds).toBe(900);
        const principal = await svc.verify(token);
        expect(principal).toEqual({
            kind: 'user',
            id: 'u1',
            sid: 's1',
            roles: ['TEACHER', 'SYSTEM_ADMIN'],
            emailVerified: true,
            av: 7,
        });
        const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
        expect(header).toEqual({ alg: 'RS256', typ: 'at+jwt', kid: 'kid-1' });
    });

    it('honours ACCESS_TOKEN_EXPIRATION', async () => {
        process.env.ACCESS_TOKEN_EXPIRATION = '5m';
        try {
            const { expiresInSeconds } = await service().signUserToken({
                userId: 'u', sessionId: 's', roles: ['STUDENT'], emailVerified: false, authzVersion: 0,
            });
            expect(expiresInSeconds).toBe(300);
        } finally {
            delete process.env.ACCESS_TOKEN_EXPIRATION;
        }
    });

    it('signs a service token (svc:<name>, aud, roles SERVICE, 5 min, no sid/av)', async () => {
        const svc = service();
        const { token, expiresInSeconds } = await svc.signServiceToken('exam', 'finance');
        expect(expiresInSeconds).toBe(300);
        const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        expect(claims).toMatchObject({ sub: 'svc:exam', aud: 'finance', roles: ['SERVICE'], iss: 'examio-auth' });
        expect(claims).not.toHaveProperty('sid');
        expect(claims).not.toHaveProperty('av');
        expect(claims.exp - claims.iat).toBe(300);
    });

    it('a service token for another audience is rejected by auth (aud mismatch)', async () => {
        const svc = service();
        const { token } = await svc.signServiceToken('exam', 'finance');
        await expect(svc.verify(token)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    });

    it('publishes the JWKS', () => {
        const svc = service();
        expect(svc.jwks().keys.map((k) => k.kid)).toEqual(['kid-1']);
    });
});
