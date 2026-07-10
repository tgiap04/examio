import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PrismaService } from '@examio/database';
import * as jwt from 'jsonwebtoken';

// ==================== Request/Response Interfaces ====================

interface ValidateTokenRequest {
    token: string;
}

interface ValidateTokenResponse {
    valid: boolean;
    userId: string;
    email: string;
    username: string;
    role: number;
    message: string;
}

interface GetUserInfoRequest {
    userId: string;
}

interface GetUserInfoResponse {
    success: boolean;
    userId: string;
    email: string;
    username: string;
    avatar: string;
    role: number;
    isVerified: boolean;
    createdAt: number;
    message: string;
}

interface CheckPermissionRequest {
    userId: string;
    resource: string;
    action: string;
}

interface CheckPermissionResponse {
    allowed: boolean;
    message: string;
}

// ==================== Controller ====================

@Controller()
export class AuthGrpcController {
    private readonly jwtSecret: string;

    constructor(private readonly prisma: PrismaService) {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error(
                'JWT_SECRET environment variable is required to start AuthGrpcController'
            );
        }
        this.jwtSecret = secret;
    }

    /**
     * Validate JWT token và trả về user info
     * Được gọi từ Exam Service, Finance Service để xác thực request
     */
    @GrpcMethod('AuthService', 'ValidateToken')
    async validateToken(
        request: ValidateTokenRequest
    ): Promise<ValidateTokenResponse> {
        try {
            const { token } = request;

            if (!token) {
                return {
                    valid: false,
                    userId: '',
                    email: '',
                    username: '',
                    role: 0,
                    message: 'Token is required',
                };
            }

            // Verify JWT
            const decoded = jwt.verify(token, this.jwtSecret, {
                algorithms: ['HS256'],
            }) as any;

            // Fetch user from database
            const user = await this.prisma.user.findUnique({
                where: { id: decoded.sub || decoded.userId },
                select: {
                    id: true,
                    email: true,
                    username: true,
                    isAdmin: true,
                    isBanned: true,
                    deletedAt: true,
                    isVerified: true,
                },
            });

            if (!user) {
                return {
                    valid: false,
                    userId: '',
                    email: '',
                    username: '',
                    role: 0,
                    message: 'User not found',
                };
            }

            if (user.isBanned || user.deletedAt) {
                return {
                    valid: false,
                    userId: '',
                    email: '',
                    username: '',
                    role: 0,
                    message: 'Account is disabled',
                };
            }

            return {
                valid: true,
                userId: user.id,
                email: user.email,
                username: user.username || '',
                role: user.isAdmin ? 1 : 0,
                message: 'Token is valid',
            };
        } catch (error) {
            return {
                valid: false,
                userId: '',
                email: '',
                username: '',
                role: 0,
                message: error.message || 'Invalid token',
            };
        }
    }

    /**
     * Lấy thông tin user theo ID
     */
    @GrpcMethod('AuthService', 'GetUserInfo')
    async getUserInfo(
        request: GetUserInfoRequest
    ): Promise<GetUserInfoResponse> {
        try {
            const { userId } = request;

            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    email: true,
                    username: true,
                    avatar: true,
                    isAdmin: true,
                    isVerified: true,
                    createdAt: true,
                },
            });

            if (!user) {
                return {
                    success: false,
                    userId: '',
                    email: '',
                    username: '',
                    avatar: '',
                    role: 0,
                    isVerified: false,
                    createdAt: 0,
                    message: 'User not found',
                };
            }

            return {
                success: true,
                userId: user.id,
                email: user.email,
                username: user.username || '',
                avatar: user.avatar || '',
                role: user.isAdmin ? 1 : 0,
                isVerified: user.isVerified,
                createdAt: user.createdAt.getTime(),
                message: 'Success',
            };
        } catch (error) {
            return {
                success: false,
                userId: '',
                email: '',
                username: '',
                avatar: '',
                role: 0,
                isVerified: false,
                createdAt: 0,
                message: error.message || 'Error fetching user',
            };
        }
    }

    /**
     * Kiểm tra quyền của user
     */
    @GrpcMethod('AuthService', 'CheckPermission')
    async checkPermission(
        request: CheckPermissionRequest
    ): Promise<CheckPermissionResponse> {
        try {
            const { userId, resource, action } = request;

            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { isAdmin: true, isBanned: true, deletedAt: true },
            });

            if (!user) {
                return {
                    allowed: false,
                    message: 'User not found',
                };
            }

            if (user.isBanned || user.deletedAt) {
                return {
                    allowed: false,
                    message: 'Account is disabled',
                };
            }

            // Role-based permission check. Deny by default.
            // isAdmin = true means admin access.
            let allowed = false;

            if (user.isAdmin) {
                // Admin có quyền mọi thứ
                allowed = true;
            } else {
                // SECURITY: this RPC cannot verify per-resource ownership, so it
                // must NOT blanket-authorize read/write/delete for normal users
                // (that was a fail-open bug). Resource ownership is enforced at
                // the owning service layer (e.g. `where: { id, userId }`), which
                // is the source of truth. Deny here by default.
                allowed = false;
            }

            // `resource`/`action` intentionally unused: ownership lives at the
            // service layer, so this RPC only distinguishes admin vs non-admin.
            void resource;
            void action;

            return {
                allowed,
                message: allowed ? 'Permission granted' : 'Permission denied',
            };
        } catch (error) {
            return {
                allowed: false,
                message: error.message || 'Error checking permission',
            };
        }
    }
}
