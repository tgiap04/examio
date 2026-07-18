import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService refresh token flow', () => {
    const mockPrisma = {};
    const mockMailService = { sendMail: jest.fn() };
    const mockPasswordService = {
        comparePasswords: jest.fn(),
        hashPassword: jest.fn(),
    };
    const mockEventPublisher = {
        publishAuthEvent: jest.fn(),
    };
    // Refresh tokens are sealed at rest; the mock mirrors real seal/open
    // behavior deterministically enough for these tests, which assert on
    // plaintext flowing to/from the repository boundary.
    const mockRefreshTokenCipher = {
        seal: jest.fn((plaintext: string) => `sealed:${plaintext}`),
        open: jest.fn((blob: string) => blob.replace(/^sealed:/, '')),
    };

    let userRepository: {
        findByIdWithRelations: jest.Mock;
    };
    let userSessionRepository: {
        findByRefreshToken: jest.Mock;
        rotateRefreshTokenIfCurrent: jest.Mock;
        deactivateSession: jest.Mock;
        create: jest.Mock;
        findBySessionId: jest.Mock;
        updateLastActivity: jest.Mock;
    };
    let jwtService: {
        sign: jest.Mock;
    };
    let generateIdService: {
        generateId: jest.Mock;
        generateSecureToken: jest.Mock;
    };
    let authService: AuthService;

    beforeEach(() => {
        userRepository = {
            findByIdWithRelations: jest.fn(),
        };

        userSessionRepository = {
            findByRefreshToken: jest.fn(),
            rotateRefreshTokenIfCurrent: jest.fn(),
            deactivateSession: jest.fn(),
            create: jest.fn(),
            findBySessionId: jest.fn(),
            updateLastActivity: jest.fn(),
        };

        jwtService = {
            sign: jest.fn(),
        };

        generateIdService = {
            generateId: jest.fn(),
            generateSecureToken: jest.fn(),
        };

        mockRefreshTokenCipher.seal.mockClear();
        mockRefreshTokenCipher.open.mockClear();

        authService = new AuthService(
            mockPrisma as any,
            userRepository as any,
            userSessionRepository as any,
            jwtService as any,
            mockMailService as any,
            mockPasswordService as any,
            generateIdService as any,
            mockEventPublisher as any,
            mockRefreshTokenCipher as any
        );
    });

    it('rotates refresh token and returns a new access token', async () => {
        userSessionRepository.findByRefreshToken.mockResolvedValue({
            id: 'session-row-id',
            sessionId: 'session-123',
            userId: 'user-123',
            isActive: true,
            expiresAt: new Date(Date.now() + 60_000),
        });
        userRepository.findByIdWithRelations.mockResolvedValue({
            id: 'user-123',
            email: 'student@example.com',
            username: 'student',
            password: 'hashed-password',
            isAdmin: false,
        });
        jwtService.sign.mockReturnValue('new-access-token');
        generateIdService.generateSecureToken.mockReturnValue(
            'refresh-part-1_refresh-part-2'
        );

        userSessionRepository.rotateRefreshTokenIfCurrent.mockResolvedValue(
            'refresh-part-1_refresh-part-2'
        );

        const result = await authService.refreshAccessToken('old-refresh-token');

        expect(jwtService.sign).toHaveBeenCalledWith({
            userId: 'user-123',
            sessionId: 'session-123',
        });
        expect(
            userSessionRepository.rotateRefreshTokenIfCurrent
        ).toHaveBeenCalledWith(
            'session-123',
            'old-refresh-token',
            'refresh-part-1_refresh-part-2'
        );
        expect(result).toEqual({
            token: 'new-access-token',
            refreshToken: 'refresh-part-1_refresh-part-2',
            user: expect.objectContaining({
                id: 'user-123',
                email: 'student@example.com',
                username: 'student',
            }),
        });
        expect(result.user.password).toBeUndefined();
    });

    it('reuses the current token when refreshing within the grace window', async () => {
        userSessionRepository.findByRefreshToken.mockResolvedValue({
            id: 'session-row-id',
            sessionId: 'session-123',
            userId: 'user-123',
            isActive: true,
            expiresAt: new Date(Date.now() + 60_000),
        });
        userRepository.findByIdWithRelations.mockResolvedValue({
            id: 'user-123',
            email: 'student@example.com',
            username: 'student',
            password: 'hashed-password',
            isAdmin: false,
        });
        jwtService.sign.mockReturnValue('new-access-token');
        generateIdService.generateSecureToken.mockReturnValue(
            'refresh-part-1_refresh-part-2'
        );
        // Grace path: a concurrent request already rotated, so the repo returns
        // the existing current token instead of the freshly generated one.
        userSessionRepository.rotateRefreshTokenIfCurrent.mockResolvedValue(
            'already-rotated-token'
        );

        const result = await authService.refreshAccessToken('stale-but-grace-token');

        expect(result.token).toBe('new-access-token');
        expect(result.refreshToken).toBe('already-rotated-token');
    });

    it('rejects a refresh token that is outside the grace window', async () => {
        userSessionRepository.findByRefreshToken.mockResolvedValue({
            id: 'session-row-id',
            sessionId: 'session-123',
            userId: 'user-123',
            isActive: true,
            expiresAt: new Date(Date.now() + 60_000),
        });
        userRepository.findByIdWithRelations.mockResolvedValue({
            id: 'user-123',
            email: 'student@example.com',
            username: 'student',
            password: 'hashed-password',
            isAdmin: false,
        });
        jwtService.sign.mockReturnValue('new-access-token');
        generateIdService.generateSecureToken.mockReturnValue(
            'refresh-part-1_refresh-part-2'
        );
        userSessionRepository.rotateRefreshTokenIfCurrent.mockResolvedValue(null);

        await expect(
            authService.refreshAccessToken('long-dead-token')
        ).rejects.toThrow(
            new UnauthorizedException('Refresh token was already used')
        );
    });

    it('rejects expired refresh token sessions', async () => {
        userSessionRepository.findByRefreshToken.mockResolvedValue({
            id: 'session-row-id',
            sessionId: 'session-123',
            userId: 'user-123',
            isActive: true,
            expiresAt: new Date(Date.now() - 1_000),
        });

        await expect(
            authService.refreshAccessToken('expired-refresh-token')
        ).rejects.toThrow(new UnauthorizedException('Session expired'));

        expect(userSessionRepository.deactivateSession).toHaveBeenCalledWith(
            'session-row-id'
        );
        expect(
            userSessionRepository.rotateRefreshTokenIfCurrent
        ).not.toHaveBeenCalled();
    });

    it('rejects refresh when session user no longer exists', async () => {
        userSessionRepository.findByRefreshToken.mockResolvedValue({
            id: 'session-row-id',
            sessionId: 'session-123',
            userId: 'missing-user',
            isActive: true,
            expiresAt: new Date(Date.now() + 60_000),
        });
        userRepository.findByIdWithRelations.mockResolvedValue(null);

        await expect(
            authService.refreshAccessToken('refresh-token')
        ).rejects.toThrow(new NotFoundException('User not found'));
    });

    describe('syncRefreshTokenBySession', () => {
        it('opens the sealed stored token and returns plaintext to the caller', async () => {
            userSessionRepository.findBySessionId.mockResolvedValue({
                id: 'session-row-id',
                sessionId: 'session-123',
                userId: 'user-123',
                isActive: true,
                expiresAt: new Date(Date.now() + 60_000),
                refreshToken: 'sealed:plaintext-current-token',
            });

            const result = await authService.syncRefreshTokenBySession(
                'user-123',
                'session-123'
            );

            expect(mockRefreshTokenCipher.open).toHaveBeenCalledWith(
                'sealed:plaintext-current-token'
            );
            expect(result).toEqual({ refreshToken: 'plaintext-current-token' });
            expect(
                userSessionRepository.updateLastActivity
            ).toHaveBeenCalledWith('session-123');
        });

        it('rejects when the session belongs to a different user', async () => {
            userSessionRepository.findBySessionId.mockResolvedValue({
                id: 'session-row-id',
                sessionId: 'session-123',
                userId: 'someone-else',
                isActive: true,
                expiresAt: new Date(Date.now() + 60_000),
                refreshToken: 'sealed:plaintext-current-token',
            });

            await expect(
                authService.syncRefreshTokenBySession('user-123', 'session-123')
            ).rejects.toThrow(new UnauthorizedException('Session không hợp lệ'));
            expect(mockRefreshTokenCipher.open).not.toHaveBeenCalled();
        });
    });
});
