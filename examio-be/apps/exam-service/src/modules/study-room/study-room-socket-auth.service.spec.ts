import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@examio/database';
import { TOKEN_VERIFIER, TokenVerificationError } from '@examio/auth-jwt';
import { StudyRoomSocketAuth } from './study-room-socket-auth.service';
import { Socket } from 'socket.io';

describe('StudyRoomSocketAuth', () => {
    let service: StudyRoomSocketAuth;
    let verify: jest.Mock;
    let prisma: { user: { findUnique: jest.Mock } };

    const user = (over: Record<string, unknown> = {}) => ({
        kind: 'user' as const,
        id: 'user1',
        sid: 's1',
        roles: ['STUDENT'],
        emailVerified: true,
        av: 0,
        ...over,
    });
    const row = (over: Record<string, unknown> = {}) => ({
        id: 'user1',
        name: 'Alice',
        avatar: 'https://example.com/avatar.png',
        isBanned: false,
        deletedAt: null,
        ...over,
    });

    beforeEach(async () => {
        verify = jest.fn();
        prisma = { user: { findUnique: jest.fn() } };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StudyRoomSocketAuth,
                { provide: TOKEN_VERIFIER, useValue: verify },
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();
        service = module.get(StudyRoomSocketAuth);
    });

    const mockSocket = (authToken?: string, headers: Record<string, string> = {}): Socket =>
        ({
            handshake: { auth: authToken ? { token: authToken } : {}, headers },
        }) as unknown as Socket;

    it('returns null when no token provided and never verifies', async () => {
        expect(await service.authenticate(mockSocket())).toBeNull();
        expect(verify).not.toHaveBeenCalled();
    });

    it('verifies handshake.auth.token and returns the display user', async () => {
        verify.mockResolvedValue(user());
        prisma.user.findUnique.mockResolvedValue(row());

        const result = await service.authenticate(mockSocket('auth-token'));

        expect(verify).toHaveBeenCalledWith('auth-token');
        expect(result).toEqual({
            id: 'user1',
            name: 'Alice',
            avatar: 'https://example.com/avatar.png',
        });
    });

    it('falls back to the accessToken cookie, then the legacy token cookie', async () => {
        verify.mockResolvedValue(user({ id: 'user2' }));
        prisma.user.findUnique.mockResolvedValue(row({ id: 'user2', name: 'Bob', avatar: null }));
        await service.authenticate(mockSocket(undefined, { cookie: 'accessToken=ck; Path=/' }));
        expect(verify).toHaveBeenLastCalledWith('ck');
        await service.authenticate(mockSocket(undefined, { cookie: 'token=legacy; Path=/' }));
        expect(verify).toHaveBeenLastCalledWith('legacy');
    });

    it('prefers handshake.auth.token over cookies', async () => {
        verify.mockResolvedValue(user());
        prisma.user.findUnique.mockResolvedValue(row());
        await service.authenticate(mockSocket('auth-token', { cookie: 'token=cookie-token' }));
        expect(verify).toHaveBeenCalledWith('auth-token');
    });

    it('rejects an unverified email, a service token and a failed verification', async () => {
        verify.mockResolvedValueOnce(user({ emailVerified: false }));
        expect(await service.authenticate(mockSocket('t'))).toBeNull();
        verify.mockResolvedValueOnce({ kind: 'service', name: 'exam' });
        expect(await service.authenticate(mockSocket('t'))).toBeNull();
        verify.mockRejectedValueOnce(new TokenVerificationError('TOKEN_EXPIRED'));
        expect(await service.authenticate(mockSocket('t'))).toBeNull();
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects banned, deleted and missing accounts', async () => {
        verify.mockResolvedValue(user());
        prisma.user.findUnique.mockResolvedValueOnce(row({ isBanned: true }));
        expect(await service.authenticate(mockSocket('t'))).toBeNull();
        prisma.user.findUnique.mockResolvedValueOnce(row({ deletedAt: new Date() }));
        expect(await service.authenticate(mockSocket('t'))).toBeNull();
        prisma.user.findUnique.mockResolvedValueOnce(null);
        expect(await service.authenticate(mockSocket('t'))).toBeNull();
    });

    it('returns null on an unexpected (database) error', async () => {
        verify.mockResolvedValue(user());
        prisma.user.findUnique.mockRejectedValue(new Error('Database error'));
        expect(await service.authenticate(mockSocket('t'))).toBeNull();
    });
});
