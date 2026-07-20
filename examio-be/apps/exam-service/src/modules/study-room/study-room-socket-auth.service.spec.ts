import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@examio/database';
import { StudyRoomSocketAuth } from './study-room-socket-auth.service';
import { Socket } from 'socket.io';

describe('StudyRoomSocketAuth', () => {
    let service: StudyRoomSocketAuth;
    let jwtService: any;
    let prisma: any;

    beforeEach(async () => {
        const mockJwt = { verifyAsync: jest.fn() };
        const mockPrisma = {
            userSession: { findUnique: jest.fn() },
            user: { findUnique: jest.fn() },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StudyRoomSocketAuth,
                {
                    provide: JwtService,
                    useValue: mockJwt,
                },
                {
                    provide: PrismaService,
                    useValue: mockPrisma,
                },
            ],
        }).compile();

        service = module.get<StudyRoomSocketAuth>(StudyRoomSocketAuth);
        jwtService = module.get(JwtService);
        prisma = module.get(PrismaService);
    });

    describe('authenticate', () => {
        const mockSocket = (authToken?: string, cookie?: string): Socket => ({
            handshake: {
                auth: authToken ? { token: authToken } : {},
                headers: {
                    cookie: cookie,
                },
            },
        } as any);

        it('returns null when no token provided', async () => {
            const socket = mockSocket();
            const result = await service.authenticate(socket);
            expect(result).toBeNull();
        });

        it('extracts token from handshake.auth.token', async () => {
            const socket = mockSocket('auth-token');
            jwtService.verifyAsync.mockResolvedValue({ userId: 'user1' });
            prisma.user.findUnique.mockResolvedValue({
                id: 'user1',
                name: 'Alice',
                avatar: 'https://example.com/avatar.png',
                isBanned: false,
                isVerified: true,
                deletedAt: null,
            } as any);

            const result = await service.authenticate(socket);

            expect(jwtService.verifyAsync).toHaveBeenCalledWith('auth-token', {
                secret: process.env.JWT_SECRET,
            });
            expect(result).toEqual({
                id: 'user1',
                name: 'Alice',
                avatar: 'https://example.com/avatar.png',
            });
        });

        it('falls back to cookie token when handshake token absent', async () => {
            const socket = mockSocket(undefined, 'token=cookie-token; Path=/');
            jwtService.verifyAsync.mockResolvedValue({ userId: 'user2' });
            prisma.user.findUnique.mockResolvedValue({
                id: 'user2',
                name: 'Bob',
                avatar: null,
                isBanned: false,
                isVerified: true,
                deletedAt: null,
            } as any);

            const result = await service.authenticate(socket);

            expect(jwtService.verifyAsync).toHaveBeenCalledWith('cookie-token', {
                secret: process.env.JWT_SECRET,
            });
            expect(result).toEqual({
                id: 'user2',
                name: 'Bob',
                avatar: null,
            });
        });

        it('prefers handshake.auth.token over cookie', async () => {
            const socket = mockSocket('auth-token', 'token=cookie-token; Path=/');
            jwtService.verifyAsync.mockResolvedValue({ userId: 'user3' });
            prisma.user.findUnique.mockResolvedValue({
                id: 'user3',
                name: 'Charlie',
                avatar: null,
                isBanned: false,
                isVerified: true,
                deletedAt: null,
            } as any);

            await service.authenticate(socket);

            expect(jwtService.verifyAsync).toHaveBeenCalledWith('auth-token', {
                secret: process.env.JWT_SECRET,
            });
        });

        it('validates session when sessionId present in token', async () => {
            const socket = mockSocket('auth-token');
            jwtService.verifyAsync.mockResolvedValue({
                userId: 'user1',
                sessionId: 'session1',
            });
            prisma.userSession.findUnique.mockResolvedValue({
                isActive: true,
            } as any);
            prisma.user.findUnique.mockResolvedValue({
                id: 'user1',
                name: 'Alice',
                avatar: null,
                isBanned: false,
                isVerified: true,
                deletedAt: null,
            } as any);

            const result = await service.authenticate(socket);

            expect(prisma.userSession.findUnique).toHaveBeenCalledWith({
                where: { sessionId: 'session1' },
                select: { isActive: true },
            });
            expect(result).toEqual({
                id: 'user1',
                name: 'Alice',
                avatar: null,
            });
        });

        it('returns null when session not found', async () => {
            const socket = mockSocket('auth-token');
            jwtService.verifyAsync.mockResolvedValue({
                userId: 'user1',
                sessionId: 'invalid-session',
            });
            prisma.userSession.findUnique.mockResolvedValue(null);

            const result = await service.authenticate(socket);

            expect(result).toBeNull();
        });

        it('returns null when session inactive', async () => {
            const socket = mockSocket('auth-token');
            jwtService.verifyAsync.mockResolvedValue({
                userId: 'user1',
                sessionId: 'session1',
            });
            prisma.userSession.findUnique.mockResolvedValue({
                isActive: false,
            } as any);

            const result = await service.authenticate(socket);

            expect(result).toBeNull();
        });

        it('returns null when user not found', async () => {
            const socket = mockSocket('auth-token');
            jwtService.verifyAsync.mockResolvedValue({ userId: 'nonexistent' });
            prisma.user.findUnique.mockResolvedValue(null);

            const result = await service.authenticate(socket);

            expect(result).toBeNull();
        });

        it('returns null when user is banned', async () => {
            const socket = mockSocket('auth-token');
            jwtService.verifyAsync.mockResolvedValue({ userId: 'banned-user' });
            prisma.user.findUnique.mockResolvedValue({
                id: 'banned-user',
                name: 'Banned',
                avatar: null,
                isBanned: true,
                isVerified: true,
                deletedAt: null,
            } as any);

            const result = await service.authenticate(socket);

            expect(result).toBeNull();
        });

        it('returns null when user is deleted', async () => {
            const socket = mockSocket('auth-token');
            jwtService.verifyAsync.mockResolvedValue({ userId: 'deleted-user' });
            prisma.user.findUnique.mockResolvedValue({
                id: 'deleted-user',
                name: 'Deleted',
                avatar: null,
                isBanned: false,
                isVerified: true,
                deletedAt: new Date('2026-01-01'),
            } as any);

            const result = await service.authenticate(socket);

            expect(result).toBeNull();
        });

        it('returns null when user not verified', async () => {
            const socket = mockSocket('auth-token');
            jwtService.verifyAsync.mockResolvedValue({ userId: 'unverified' });
            prisma.user.findUnique.mockResolvedValue({
                id: 'unverified',
                name: 'Unverified',
                avatar: null,
                isBanned: false,
                isVerified: false,
                deletedAt: null,
            } as any);

            const result = await service.authenticate(socket);

            expect(result).toBeNull();
        });

        it('returns null when JWT verification fails', async () => {
            const socket = mockSocket('invalid-token');
            jwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

            const result = await service.authenticate(socket);

            expect(result).toBeNull();
        });

        it('returns null on any unexpected error', async () => {
            const socket = mockSocket('auth-token');
            jwtService.verifyAsync.mockResolvedValue({ userId: 'user1' });
            prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

            const result = await service.authenticate(socket);

            expect(result).toBeNull();
        });

        it('successfully authenticates valid user with all checks passing', async () => {
            const socket = mockSocket('valid-token');
            jwtService.verifyAsync.mockResolvedValue({
                userId: 'valid-user',
                sessionId: 'valid-session',
            });
            prisma.userSession.findUnique.mockResolvedValue({
                isActive: true,
            } as any);
            prisma.user.findUnique.mockResolvedValue({
                id: 'valid-user',
                name: 'Valid User',
                avatar: 'https://example.com/avatar.jpg',
                isBanned: false,
                isVerified: true,
                deletedAt: null,
            } as any);

            const result = await service.authenticate(socket);

            expect(result).toEqual({
                id: 'valid-user',
                name: 'Valid User',
                avatar: 'https://example.com/avatar.jpg',
            });
        });
    });
});
