import {
    ExecutionContext,
    ForbiddenException,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@examio/database';
import { AuthGuard } from './auth.guard';
import { AllowUnverified } from '../decorators/allow-unverified.decorator';

class TestController {
    @AllowUnverified()
    allowed() {
        return 'allowed';
    }

    restricted() {
        return 'restricted';
    }
}

const baseUser = {
    id: 'user-1',
    username: 'u',
    email: 'u@examio.test',
    isAdmin: false,
    isVerified: true,
    isBanned: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

function buildContext(
    handler: () => string,
    headers: Record<string, string> = { authorization: 'Bearer valid' }
) {
    const request: Record<string, unknown> = { headers };
    const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => handler,
        getClass: () => TestController,
    } as unknown as ExecutionContext;
    return { context, request };
}

describe('AuthGuard', () => {
    let guard: AuthGuard;
    let jwtService: { verifyAsync: jest.Mock };
    let prisma: {
        user: { findUnique: jest.Mock };
        userSession: { findUnique: jest.Mock };
    };
    const controller = new TestController();

    beforeEach(() => {
        jwtService = {
            verifyAsync: jest
                .fn()
                .mockResolvedValue({ userId: 'user-1', sessionId: 's-1' }),
        };
        prisma = {
            user: { findUnique: jest.fn().mockResolvedValue({ ...baseUser }) },
            userSession: {
                findUnique: jest.fn().mockResolvedValue({ isActive: true }),
            },
        };
        guard = new AuthGuard(
            jwtService as unknown as JwtService,
            prisma as unknown as PrismaService,
            new Reflector()
        );
    });

    it('lets a verified user through and attaches the user to the request', async () => {
        const { context, request } = buildContext(controller.restricted);

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(request['user']).toMatchObject({ id: 'user-1' });
    });

    it('lets an unverified user through on an @AllowUnverified route', async () => {
        prisma.user.findUnique.mockResolvedValue({
            ...baseUser,
            isVerified: false,
        });
        const { context, request } = buildContext(controller.allowed);

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(request['user']).toMatchObject({ isVerified: false });
    });

    it('rejects an unverified user elsewhere with 403, not 401', async () => {
        prisma.user.findUnique.mockResolvedValue({
            ...baseUser,
            isVerified: false,
        });
        const { context } = buildContext(controller.restricted);

        const result = guard.canActivate(context);
        await expect(result).rejects.toBeInstanceOf(ForbiddenException);
        await expect(result).rejects.toMatchObject({
            message: 'Email not verified',
        });
    });

    it('rejects a banned user with 401 even on an @AllowUnverified route', async () => {
        prisma.user.findUnique.mockResolvedValue({
            ...baseUser,
            isBanned: true,
            isVerified: false,
        });
        const { context } = buildContext(controller.allowed);

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
            UnauthorizedException
        );
    });

    it('rejects a soft-deleted user with 401', async () => {
        prisma.user.findUnique.mockResolvedValue({
            ...baseUser,
            deletedAt: new Date(),
        });
        const { context } = buildContext(controller.allowed);

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
            UnauthorizedException
        );
    });

    it('rejects when the session is inactive', async () => {
        prisma.userSession.findUnique.mockResolvedValue({ isActive: false });
        const { context } = buildContext(controller.restricted);

        await expect(guard.canActivate(context)).rejects.toMatchObject({
            message: 'Session has been invalidated',
        });
    });

    it('rejects when the user does not exist', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        const { context } = buildContext(controller.restricted);

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
            UnauthorizedException
        );
    });

    it('rewrites JWT verification failures as 401 "Invalid or expired token"', async () => {
        jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
        const { context } = buildContext(controller.restricted);

        const result = guard.canActivate(context);
        await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(result).rejects.toMatchObject({
            message: 'Invalid or expired token',
        });
    });

    it('rejects a request with no token with 401', async () => {
        const { context } = buildContext(controller.restricted, {});

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
            UnauthorizedException
        );
        expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('accepts the token from the cookie', async () => {
        const { context } = buildContext(controller.restricted, {
            cookie: 'token=cookie-token',
        });

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(jwtService.verifyAsync).toHaveBeenCalledWith(
            'cookie-token',
            expect.any(Object)
        );
    });
});
