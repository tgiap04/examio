import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '@examio/database';
import * as cookie from 'cookie';

/**
 * AdminGuard - Requires the request to be authenticated AND the user to have
 * isAdmin = true on the User record.
 *
 * Unlike extending AuthGuard via class inheritance (which can cause double
 * JWT verification), this guard injects the same dependencies and re-uses
 * the same token extraction + DB lookup logic. This keeps a single source
 * of truth for auth and avoids re-entering canActivate twice.
 */
@Injectable()
export class AdminGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly prisma: PrismaService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request: Request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromRequest(request);

        if (!token) {
            throw new UnauthorizedException('Token is required');
        }

        let decoded: { userId?: string };
        try {
            decoded = await this.jwtService.verifyAsync(token, {
                secret: process.env.JWT_SECRET,
            });
        } catch {
            throw new UnauthorizedException('Invalid or expired token');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                username: true,
                email: true,
                isAdmin: true,
                isVerified: true,
                isBanned: true,
                deletedAt: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        if (user.isBanned || user.deletedAt) {
            throw new UnauthorizedException('Account is disabled');
        }

        if (!user.isVerified) {
            throw new ForbiddenException('Email not verified');
        }

        if (!user.isAdmin) {
            throw new ForbiddenException('Admin access required');
        }

        request['user'] = user;
        return true;
    }

    /**
     * Extract token từ request theo thứ tự ưu tiên:
     * 1. Cookie (ưu tiên cao nhất - secure với httpOnly)
     * 2. Authorization header (fallback cho localStorage)
     */
    private extractTokenFromRequest(request: Request): string | undefined {
        const cookieHeader = request.headers.cookie;
        if (cookieHeader) {
            const cookies = cookie.parse(cookieHeader);
            if (cookies.token) {
                return cookies.token;
            }
        }

        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        return undefined;
    }
}
