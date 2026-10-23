import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '@examio/redis';
import { TOKEN_VERIFIER, TokenVerificationError } from '@examio/auth-jwt';
import { SignJWT } from 'jose';
import { Socket } from 'socket.io';
import { PublicProfileClient } from '@examio/grpc';
import {
    SocketAuthError,
    StudyRoomSocketAuth,
    authzVersionKey,
} from './study-room-socket-auth.service';

describe('StudyRoomSocketAuth', () => {
    let service: StudyRoomSocketAuth;
    let verify: jest.Mock;
    let profiles: jest.Mock;
    let redisGet: jest.Mock;
    const EXP = Math.floor(Date.now() / 1000) + 600;

    /** A (fake-signed) JWT: the verifier is mocked, only the `exp` claim is read back. */
    async function jwt(exp = EXP) {
        return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(exp).sign(new TextEncoder().encode('k'.repeat(32)));
    }

    const user = (over: Record<string, unknown> = {}) => ({
        kind: 'user' as const,
        id: 'user1',
        sid: 's1',
        roles: ['STUDENT'],
        emailVerified: true,
        av: 3,
        ...over,
    });
    const row = (over: Record<string, unknown> = {}) => ({
        id: 'user1',
        username: 'alice',
        name: 'Alice',
        avatar: 'https://example.com/avatar.png',
        ...over,
    });

    beforeEach(async () => {
        verify = jest.fn();
        redisGet = jest.fn().mockResolvedValue(null);
        profiles = jest.fn().mockResolvedValue([row()]);
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StudyRoomSocketAuth,
                { provide: TOKEN_VERIFIER, useValue: verify },
                { provide: PublicProfileClient, useValue: { getPublicProfiles: profiles } },
                { provide: RedisService, useValue: { getClient: () => ({ get: redisGet }) } },
            ],
        }).compile();
        service = module.get(StudyRoomSocketAuth);
    });

    const mockSocket = (authToken?: string, headers: Record<string, string> = {}): Socket =>
        ({
            handshake: { auth: authToken ? { token: authToken } : {}, headers },
        }) as unknown as Socket;

    const codeOf = async (p: Promise<unknown>): Promise<string> => {
        try {
            await p;
            return 'ok';
        } catch (e) {
            if (e instanceof SocketAuthError) return e.code;
            throw e;
        }
    };

    it('rejects a missing token with TOKEN_MISSING and never verifies', async () => {
        expect(await codeOf(service.authenticate(mockSocket()))).toBe('TOKEN_MISSING');
        expect(verify).not.toHaveBeenCalled();
    });

    it('verifies handshake.auth.token and returns user, av and exp', async () => {
        verify.mockResolvedValue(user());
        const token = await jwt();
        const result = await service.authenticate(mockSocket(token));
        expect(verify).toHaveBeenCalledWith(token);
        expect(result).toEqual({
            user: { id: 'user1', name: 'Alice', avatar: 'https://example.com/avatar.png' },
            av: 3,
            exp: EXP,
        });
    });

    it('falls back to the accessToken cookie and ignores the retired token cookie', async () => {
        verify.mockResolvedValue(user({ id: 'user2' }));
        profiles.mockResolvedValue([row({ id: 'user2', name: 'Bob', avatar: null })]);
        const token = await jwt();
        await service.authenticate(mockSocket(undefined, { cookie: `accessToken=${token}; Path=/` }));
        expect(verify).toHaveBeenLastCalledWith(token);
        verify.mockClear();
        expect(await codeOf(service.authenticate(mockSocket(undefined, { cookie: 'token=legacy; Path=/' })))).toBe('TOKEN_MISSING');
        expect(verify).not.toHaveBeenCalled();
    });

    it('prefers handshake.auth.token over cookies', async () => {
        verify.mockResolvedValue(user());
        const token = await jwt();
        await service.authenticate(mockSocket(token, { cookie: 'token=cookie-token' }));
        expect(verify).toHaveBeenCalledWith(token);
    });

    it('maps verifier failures to TOKEN_EXPIRED / TOKEN_INVALID', async () => {
        const t = await jwt();
        verify.mockRejectedValueOnce(new TokenVerificationError('TOKEN_EXPIRED'));
        expect(await codeOf(service.authenticate(mockSocket(t)))).toBe('TOKEN_EXPIRED');
        verify.mockRejectedValueOnce(new TokenVerificationError('TOKEN_INVALID'));
        expect(await codeOf(service.authenticate(mockSocket(t)))).toBe('TOKEN_INVALID');
        verify.mockRejectedValueOnce(new Error('boom'));
        expect(await codeOf(service.authenticate(mockSocket(t)))).toBe('TOKEN_INVALID');
    });

    it('rejects an unverified email and a service token', async () => {
        const t = await jwt();
        verify.mockResolvedValueOnce(user({ emailVerified: false }));
        expect(await codeOf(service.authenticate(mockSocket(t)))).toBe('EMAIL_NOT_VERIFIED');
        verify.mockResolvedValueOnce({ kind: 'service', name: 'exam' });
        expect(await codeOf(service.authenticate(mockSocket(t)))).toBe('PERMISSION_DENIED');
        expect(profiles).not.toHaveBeenCalled();
    });

    it('requires study_room:join (SYSTEM_ADMIN-only is refused, STUDENT and TEACHER pass)', async () => {
        const t = await jwt();
        verify.mockResolvedValueOnce(user({ roles: ['SYSTEM_ADMIN'] }));
        expect(await codeOf(service.authenticate(mockSocket(t)))).toBe('PERMISSION_DENIED');
        verify.mockResolvedValueOnce(user({ roles: ['TEACHER'] }));
        expect(await codeOf(service.authenticate(mockSocket(t)))).toBe('ok');
        verify.mockResolvedValueOnce(user({ roles: ['STUDENT'] }));
        expect(await codeOf(service.authenticate(mockSocket(t)))).toBe('ok');
    });

    describe('authz version (av)', () => {
        it('reads the gateway key gw:user:<sub>:av', async () => {
            verify.mockResolvedValue(user());
            await service.authenticate(mockSocket(await jwt()));
            expect(redisGet).toHaveBeenCalledWith(authzVersionKey('user1'));
            expect(authzVersionKey('abc')).toBe('gw:user:abc:av');
        });

        it('TOKEN_STALE when the token av is below the stored one', async () => {
            verify.mockResolvedValue(user({ av: 3 }));
            redisGet.mockResolvedValue('4');
            expect(await codeOf(service.authenticate(mockSocket(await jwt())))).toBe('TOKEN_STALE');
        });

        it('passes when av equals or exceeds the stored one, or the key is missing', async () => {
            verify.mockResolvedValue(user({ av: 3 }));
            redisGet.mockResolvedValue('3');
            expect(await codeOf(service.authenticate(mockSocket(await jwt())))).toBe('ok');
            redisGet.mockResolvedValue(null);
            expect(await codeOf(service.authenticate(mockSocket(await jwt())))).toBe('ok');
        });

        it('fails closed with SERVICE_UNAVAILABLE when Redis errors', async () => {
            verify.mockResolvedValue(user());
            redisGet.mockRejectedValue(new Error('redis down'));
            expect(await codeOf(service.authenticate(mockSocket(await jwt())))).toBe('SERVICE_UNAVAILABLE');
        });
    });

    it('rejects an account auth no longer knows (deleted / missing)', async () => {
        verify.mockResolvedValue(user());
        profiles.mockResolvedValueOnce([null]);
        expect(await codeOf(service.authenticate(mockSocket(await jwt())))).toBe('UNAUTHORIZED');
    });

    it('asks auth STRICTLY for just this user (a ban is enforced by the av check, not a DB read)', async () => {
        verify.mockResolvedValue(user());
        await service.authenticate(mockSocket(await jwt()));
        expect(profiles).toHaveBeenCalledWith(['user1'], undefined, { strict: true });
    });

    it('fails closed with SERVICE_UNAVAILABLE when auth is unreachable', async () => {
        verify.mockResolvedValue(user());
        profiles.mockRejectedValue(new Error('auth down'));
        expect(await codeOf(service.authenticate(mockSocket(await jwt())))).toBe('SERVICE_UNAVAILABLE');
    });
});
