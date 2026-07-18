import {
    Injectable,
    ConflictException,
    NotFoundException,
    InternalServerErrorException,
    BadRequestException,
    UnauthorizedException,
    Inject,
    OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as crypto from 'crypto';

// Shared libs imports
import { PrismaService } from '@examio/database';
import {
    MailService,
    PasswordService,
    GenerateIdService,
    sanitizeUser,
    generateCode,
    WALLET_SERVICE,
    EventPublisherService,
    EventType,
    RefreshTokenCipherService,
} from '@examio/common';

// Local imports
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserRepository } from './repositories/user.repository';
import { UserSessionRepository } from './devices/repositories/user-session.repository';

export interface DeviceInfo {
    deviceId: string;
    userAgent?: string;
    ipAddress?: string;
}

@Injectable()
export class AuthService {
    private readonly sessionTtlMs = 30 * 24 * 60 * 60 * 1000;

    constructor(
        private readonly prisma: PrismaService,
        private readonly userRepository: UserRepository,
        private readonly userSessionRepository: UserSessionRepository,
        private readonly jwtService: JwtService,
        private readonly mailService: MailService,
        private readonly passwordService: PasswordService,
        private readonly generateIdService: GenerateIdService,
        private readonly eventPublisher: EventPublisherService,
        private readonly refreshTokenCipher: RefreshTokenCipherService
    ) {}

    /**
     * Sign an access token. When `sessionId` is known, it is embedded as a
     * claim so AuthGuard/AdminGuard can look up the UserSession and reject
     * the token immediately once that session is deactivated (logout,
     * "logout other devices", password reset) instead of waiting for the
     * JWT to expire naturally.
     */
    signAccessToken(userId: string, sessionId?: string): string {
        return this.jwtService.sign(
            sessionId ? { userId, sessionId } : { userId }
        );
    }

    /**
     * Constant-time comparison for verification/reset/change codes, to
     * avoid leaking match-length information through response timing.
     */
    private isCodeMatch(expected: string, provided: string): boolean {
        const expectedBuf = Buffer.from(expected);
        const providedBuf = Buffer.from(provided);
        if (expectedBuf.length !== providedBuf.length) {
            return false;
        }
        return crypto.timingSafeEqual(expectedBuf, providedBuf);
    }

    async login(loginDto: LoginDto, deviceInfo?: DeviceInfo) {
        const { credential, password } = loginDto;
        if (!credential || !password) {
            throw new BadRequestException('Thông tin đăng nhập không hợp lệ');
        }
        try {
            const user = await this.userRepository.findByCredential(credential);
            if (!user) {
                // Same error as a wrong password — do not reveal whether the
                // account exists (prevents user enumeration).
                throw new UnauthorizedException(
                    'Thông tin đăng nhập không hợp lệ'
                );
            }
            const isPasswordValid = await this.passwordService.comparePasswords(
                password,
                user.password || ''
            );
            if (!isPasswordValid) {
                throw new UnauthorizedException(
                    'Thông tin đăng nhập không hợp lệ'
                );
            }
            try {
                // Extract device info from request if available
                let sessionId: string | undefined;
                let refreshToken: string | undefined;
                if (deviceInfo) {
                    const session = await this.createSession(
                        user.id,
                        deviceInfo
                    );
                    sessionId = session.sessionId;
                    refreshToken = session.refreshToken;
                }
                const token = this.signAccessToken(user.id, sessionId);

                return {
                    token,
                    user: sanitizeUser(user),
                    success: true,
                    sessionId,
                    refreshToken,
                    deviceId: deviceInfo?.deviceId,
                };
            } catch (error) {
                throw error;
            }
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException ||
                error instanceof UnauthorizedException
            ) {
                throw error;
            }
            throw new InternalServerErrorException(
                'Đăng nhập không thành công'
            );
        }
    }

    async register(registerDto: RegisterDto, deviceInfo?: DeviceInfo) {
        const { username, email, password } = registerDto;
        if (!username || !email || !password) {
            throw new BadRequestException('Thông tin đăng ký không hợp lệ');
        }

        try {
            const [emailExists, usernameExists] = await Promise.all([
                this.userRepository.emailExists(email),
                this.userRepository.usernameExists(username),
            ]);

            if (emailExists) {
                throw new ConflictException('Email đã được sử dụng');
            }

            if (usernameExists) {
                throw new ConflictException('Username đã được sử dụng');
            }

            const hashedPassword =
                await this.passwordService.hashPassword(password);

            const newUser = await this.prisma.$transaction(async (tx) => {
                const user = await tx.user.create({
                    data: {
                        id: this.generateIdService.generateId(),
                        username,
                        email,
                        password: hashedPassword,
                    },
                });

                // Create default subscription
                await tx.userSubscription.create({
                    data: {
                        id: this.generateIdService.generateId(),
                        userId: user.id,
                        tier: 0,
                        billingCycle: 'monthly',
                        isActive: false,
                    },
                });

                return user;
            });

            // Publish USER_CREATED event for other services (fire-and-forget to avoid timeout)
            this.eventPublisher
                .publishAuthEvent(EventType.USER_CREATED, {
                    userId: newUser.id,
                    email: newUser.email,
                    username: newUser.username,
                })
                .catch((error) => {
                    console.error(
                        `Failed to publish USER_CREATED event for user ${newUser.id}:`,
                        error
                    );
                });

            // Send welcome email
            this.mailService
                .sendMail(
                    email,
                    'Chào mừng bạn đến với ExamIO',
                    'welcome.template',
                    {
                        username: newUser.username,
                        useremail: newUser.email,
                        loginUrl: `${process.env.FRONTEND_URL}/login`,
                    }
                )
                .catch((error) => {
                    console.error(
                        `Failed to send welcome email to ${email}:`,
                        error
                    );
                });

            // Auto-login: create session first, then sign the token so it
            // can carry the sessionId claim.
            let sessionId: string | undefined;
            let refreshToken: string | undefined;

            if (deviceInfo) {
                const session = await this.createSession(
                    newUser.id,
                    deviceInfo
                );
                sessionId = session.sessionId;
                refreshToken = session.refreshToken;
            }
            const token = this.signAccessToken(newUser.id, sessionId);

            return {
                message: 'Đăng ký thành công',
                token,
                user: sanitizeUser(newUser),
                success: true,
                sessionId,
                refreshToken,
                deviceId: deviceInfo?.deviceId,
            };
        } catch (error) {
            if (error instanceof ConflictException) {
                throw error;
            }
            console.log(error.message);
            throw new InternalServerErrorException('Đăng ký không thành công');
        }
    }

    async sendVerificationEmail(user: User) {
        try {
            if (user.isVerified) {
                return { message: 'Tài khoản đã được xác minh' };
            }

            const code = generateCode(6);

            await this.prisma.verifyAccountCode.upsert({
                where: { userId: user.id },
                update: {
                    code,
                    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                },
                create: {
                    id: this.generateIdService.generateId(),
                    userId: user.id,
                    code,
                    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                },
            });

            this.mailService
                .sendMail(
                    user.email,
                    'Xác minh tài khoản của bạn',
                    'verify-account.template',
                    {
                        username: user.username,
                        verificationCode: code,
                    }
                )
                .catch((error) => {
                    console.error(
                        `Failed to send verification email to ${user.email}:`,
                        error
                    );
                });

            return { message: 'Email xác minh đã được gửi' };
        } catch (error) {
            console.log(error.message);
            throw new InternalServerErrorException(
                'Gửi email không thành công'
            );
        }
    }

    async verifyAccount(userId: string, code: string) {
        try {
            const verificationCode =
                await this.prisma.verifyAccountCode.findUnique({
                    where: { userId },
                });

            if (!verificationCode) {
                throw new NotFoundException('Mã xác minh không hợp lệ');
            }

            if (!this.isCodeMatch(verificationCode.code, code)) {
                throw new BadRequestException('Mã xác minh không chính xác');
            }

            if (new Date() > verificationCode.expiresAt) {
                throw new BadRequestException('Mã xác minh đã hết hạn');
            }

            await this.userRepository.update(
                userId,
                { isVerified: true },
                userId
            );

            await this.prisma.verifyAccountCode.delete({
                where: { userId },
            });

            return { message: 'Tài khoản đã được xác minh thành công' };
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }
            throw new InternalServerErrorException(
                'Xác minh tài khoản không thành công'
            );
        }
    }

    async sendCodeToResetPassword(email: string) {
        // Always return the same response regardless of whether the email
        // is registered — revealing account existence enables enumeration.
        const genericResponse = {
            message: 'Email đặt lại mật khẩu đã được gửi',
        };
        try {
            const user = await this.userRepository.findByEmail(email, false);

            if (!user) {
                return genericResponse;
            }

            const code = generateCode(6);

            await this.prisma.resetPasswordCode.upsert({
                where: { userId: user.id },
                update: {
                    code,
                    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                },
                create: {
                    id: this.generateIdService.generateId(),
                    userId: user.id,
                    code,
                    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                },
            });

            this.mailService
                .sendMail(
                    user.email,
                    'Yêu cầu đặt lại mật khẩu',
                    'reset-password.template',
                    {
                        username: user.username,
                        resetCode: code,
                    }
                )
                .catch((error) => {
                    console.error(
                        `Failed to send reset password email to ${user.email}:`,
                        error
                    );
                });

            return genericResponse;
        } catch (error) {
            console.log(error.message);
            throw new InternalServerErrorException(
                'Gửi email đặt lại mật khẩu không thành công'
            );
        }
    }

    async resetPassword(email: string, code: string, newPassword: string) {
        try {
            const user = await this.userRepository.findByEmail(email, false);

            if (!user) {
                throw new NotFoundException('Không tìm thấy người dùng');
            }

            const resetCode = await this.prisma.resetPasswordCode.findUnique({
                where: { userId: user.id },
            });

            if (!resetCode) {
                throw new NotFoundException('Mã đặt lại mật khẩu không hợp lệ');
            }

            if (!this.isCodeMatch(resetCode.code, code)) {
                throw new BadRequestException(
                    'Mã đặt lại mật khẩu không chính xác'
                );
            }

            if (new Date() > resetCode.expiresAt) {
                throw new BadRequestException('Mã đặt lại mật khẩu đã hết hạn');
            }

            await this.userRepository.update(
                user.id,
                {
                    password:
                        await this.passwordService.hashPassword(newPassword),
                },
                user.id
            );

            await this.prisma.resetPasswordCode.delete({
                where: { userId: user.id },
            });

            // Invalidate all existing sessions so a session hijacked before
            // the reset cannot survive the credential rotation.
            await this.userSessionRepository.deactivateAllSessions(user.id);

            return { message: 'Mật khẩu đã được đặt lại thành công' };
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }
            throw new InternalServerErrorException(
                'Đặt lại mật khẩu không thành công'
            );
        }
    }

    async sendCodeToChangePassword(user: User) {
        try {
            const code = generateCode(6);

            await this.prisma.resetPasswordCode.upsert({
                where: { userId: user.id },
                update: {
                    code,
                    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                },
                create: {
                    id: this.generateIdService.generateId(),
                    userId: user.id,
                    code,
                    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                },
            });

            this.mailService
                .sendMail(
                    user.email,
                    'Xác minh đổi mật khẩu',
                    'change-password.template',
                    {
                        username: user.username,
                        changeCode: code,
                    }
                )
                .catch((error) => {
                    console.error(
                        `Failed to send change password email to ${user.email}:`,
                        error
                    );
                });

            return { message: 'Mã xác minh đã được gửi đến email của bạn' };
        } catch (error) {
            console.log(error.message);
            throw new InternalServerErrorException(
                'Gửi mã xác minh không thành công'
            );
        }
    }

    async changePassword(
        user: User,
        code: string,
        currentPassword: string,
        newPassword: string
    ) {
        try {
            if (user.password) {
                const isPasswordValid =
                    await this.passwordService.comparePasswords(
                        currentPassword,
                        user.password
                    );
                if (!isPasswordValid) {
                    throw new BadRequestException(
                        'Mật khẩu hiện tại không đúng'
                    );
                }
            }

            const resetCode = await this.prisma.resetPasswordCode.findUnique({
                where: { userId: user.id },
            });

            if (!resetCode) {
                throw new NotFoundException('Mã xác minh không hợp lệ');
            }

            if (!this.isCodeMatch(resetCode.code, code)) {
                throw new BadRequestException('Mã xác minh không chính xác');
            }

            if (new Date() > resetCode.expiresAt) {
                throw new BadRequestException('Mã xác minh đã hết hạn');
            }

            await this.userRepository.update(
                user.id,
                {
                    password:
                        await this.passwordService.hashPassword(newPassword),
                },
                user.id
            );

            await this.prisma.resetPasswordCode.delete({
                where: { userId: user.id },
            });

            // Invalidate all existing sessions so a session hijacked before
            // the change cannot survive the credential rotation.
            await this.userSessionRepository.deactivateAllSessions(user.id);

            return { message: 'Mật khẩu đã được đổi thành công' };
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }
            throw new InternalServerErrorException(
                'Đổi mật khẩu không thành công'
            );
        }
    }

    private async handleOAuthLogin(
        email: string,
        username: string,
        avatar?: string,
        deviceInfo?: DeviceInfo
    ) {
        let existingUser = await this.userRepository.findByEmail(email, false);

        if (!existingUser) {
            existingUser = await this.prisma.$transaction(async (tx) => {
                const user = await tx.user.create({
                    data: {
                        id: this.generateIdService.generateId(),
                        email,
                        username,
                        avatar,
                        isVerified: true,
                        password: null,
                    },
                });

                await tx.userSubscription.create({
                    data: {
                        id: this.generateIdService.generateId(),
                        userId: user.id,
                        tier: 0,
                        billingCycle: 'monthly',
                        isActive: false,
                    },
                });

                return user;
            });

            // Publish USER_CREATED event for wallet creation and other services (fire-and-forget to avoid timeout)
            this.eventPublisher
                .publishAuthEvent(EventType.USER_CREATED, {
                    userId: existingUser.id,
                    email: existingUser.email,
                    username: existingUser.username,
                })
                .catch((error) => {
                    console.error(
                        `Failed to publish USER_CREATED event for user ${existingUser?.id}:`,
                        error
                    );
                });
        }

        // Create session for OAuth login first so the access token can carry
        // the sessionId claim. When deviceInfo is unavailable at this call
        // site (e.g. the passport Google strategy), the session is created
        // later by the controller, which re-signs the token at that point.
        let sessionId: string | undefined;
        let refreshToken: string | undefined;
        if (deviceInfo) {
            const session = await this.createSession(
                existingUser.id,
                deviceInfo
            );
            sessionId = session.sessionId;
            refreshToken = session.refreshToken;
        }
        const token = this.signAccessToken(existingUser.id, sessionId);

        return {
            token,
            user: sanitizeUser(existingUser),
            success: true,
            sessionId,
            refreshToken,
            deviceId: deviceInfo?.deviceId,
        };
    }

    async googleLogin(user: any, deviceInfo?: DeviceInfo) {
        const { email, picture } = user;
        const username = email.split('@')[0];
        return this.handleOAuthLogin(email, username, picture, deviceInfo);
    }

    async googleOneTapLogin(credential: string, deviceInfo?: DeviceInfo) {
        const { OAuth2Client } = await import('google-auth-library');
        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
            throw new BadRequestException('Invalid Google credential');
        }
        const { email, picture, name } = payload;
        const username = name || email.split('@')[0];
        return this.handleOAuthLogin(email, username, picture, deviceInfo);
    }


    async getUser(user: User) {
        const foundUser = await this.userRepository.findByIdWithRelations(
            user.id,
            ['wallet', 'subscription'],
            false // Always get fresh data - wallet balance may change from other services
        );
        if (!foundUser) {
            throw new NotFoundException('Người dùng không tồn tại');
        }
        return { user: sanitizeUser(foundUser) };
    }

    async logout(sessionId: string): Promise<void> {
        try {
            const session =
                await this.userSessionRepository.findBySessionId(sessionId);
            if (session) {
                await this.userSessionRepository.deactivateSession(session.id);
            }
        } catch (error) {
            console.error('Error deactivating session:', error);
            // Don't throw error - allow logout to proceed even if session cleanup fails
        }
    }

    async refreshAccessToken(
        refreshToken: string
    ): Promise<{ token: string; refreshToken: string; user: any }> {
        // Find session by refresh token
        const session =
            await this.userSessionRepository.findByRefreshToken(refreshToken);

        if (!session || !session.isActive) {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }

        // Check if session has expired
        if (new Date() > session.expiresAt) {
            await this.userSessionRepository.deactivateSession(session.id);
            throw new UnauthorizedException('Session expired');
        }

        // Get user
        const user = await this.userRepository.findByIdWithRelations(
            session.userId,
            []
        );
        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Generate new access token. rotateRefreshTokenIfCurrent trả về refresh
        // token hợp lệ để cấp lại: token mới nếu rotate thành công, hoặc token
        // hiện hành nếu request đến trong grace window (tab khác đã rotate).
        const token = this.signAccessToken(user.id, session.sessionId);
        const nextRefreshToken = this.generateRefreshToken();
        const effectiveRefreshToken =
            await this.userSessionRepository.rotateRefreshTokenIfCurrent(
                session.sessionId,
                refreshToken,
                nextRefreshToken
            );

        if (!effectiveRefreshToken) {
            throw new UnauthorizedException('Refresh token was already used');
        }

        return {
            token,
            refreshToken: effectiveRefreshToken,
            user: sanitizeUser(user),
        };
    }

    async syncRefreshTokenBySession(
        userId: string,
        sessionId: string
    ): Promise<{ refreshToken: string }> {
        const session = await this.userSessionRepository.findBySessionId(
            sessionId
        );

        if (!session || !session.isActive || session.userId !== userId) {
            throw new UnauthorizedException('Session không hợp lệ');
        }

        if (new Date() > session.expiresAt) {
            await this.userSessionRepository.deactivateSession(session.id);
            throw new UnauthorizedException('Session expired');
        }

        await this.userSessionRepository.updateLastActivity(session.sessionId);

        // session.refreshToken is stored sealed at rest — open() it before
        // handing it back to the client, which must only ever see plaintext.
        return {
            refreshToken: this.refreshTokenCipher.open(session.refreshToken),
        };
    }

    async createSession(
        userId: string,
        deviceInfo: DeviceInfo
    ): Promise<{ sessionId: string; refreshToken: string }> {
        const sessionId = this.generateIdService.generateSecureToken(16);
        const refreshToken = this.generateRefreshToken();
        const { browser, os, deviceName } = this.parseUserAgent(
            deviceInfo.userAgent || ''
        );

        await this.userSessionRepository.create({
            id: this.generateIdService.generateId(),
            userId,
            sessionId,
            refreshToken, // Store refresh token
            deviceId: deviceInfo.deviceId,
            deviceName,
            browser,
            os,
            ipAddress: deviceInfo.ipAddress || null,
            country: null,
            city: null,
            expiresAt: new Date(Date.now() + this.sessionTtlMs),
        });

        return { sessionId, refreshToken };
    }

    private generateRefreshToken(): string {
        return this.generateIdService.generateSecureToken(32);
    }

    private parseUserAgent(userAgent: string): {
        browser: string | null;
        os: string | null;
        deviceName: string | null;
    } {
        if (!userAgent) return { browser: null, os: null, deviceName: null };

        let browser: string | null = null;
        let os: string | null = null;
        let deviceName: string | null = null;

        if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
            const match = userAgent.match(/Chrome\/(\d+)/);
            browser = match ? `Chrome ${match[1]}` : 'Chrome';
        } else if (
            userAgent.includes('Safari') &&
            !userAgent.includes('Chrome')
        ) {
            const match = userAgent.match(/Version\/(\d+)/);
            browser = match ? `Safari ${match[1]}` : 'Safari';
        } else if (userAgent.includes('Firefox')) {
            const match = userAgent.match(/Firefox\/(\d+)/);
            browser = match ? `Firefox ${match[1]}` : 'Firefox';
        } else if (userAgent.includes('Edg')) {
            const match = userAgent.match(/Edg\/(\d+)/);
            browser = match ? `Edge ${match[1]}` : 'Edge';
        }

        if (userAgent.includes('Windows NT 10')) {
            os = 'Windows 10/11';
        } else if (userAgent.includes('Windows')) {
            os = 'Windows';
        } else if (userAgent.includes('Mac OS X')) {
            const match = userAgent.match(/Mac OS X (\d+[._]\d+)/);
            os = match ? `macOS ${match[1].replace('_', '.')}` : 'macOS';
        } else if (userAgent.includes('Linux')) {
            os = 'Linux';
        } else if (userAgent.includes('Android')) {
            const match = userAgent.match(/Android (\d+)/);
            os = match ? `Android ${match[1]}` : 'Android';
        } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
            const match = userAgent.match(/OS (\d+)/);
            os = match ? `iOS ${match[1]}` : 'iOS';
        }

        if (userAgent.includes('iPhone')) {
            deviceName = 'iPhone';
        } else if (userAgent.includes('iPad')) {
            deviceName = 'iPad';
        } else if (userAgent.includes('Android')) {
            deviceName = 'Android Device';
        } else if (userAgent.includes('Macintosh')) {
            deviceName = 'Mac';
        } else if (userAgent.includes('Windows')) {
            deviceName = 'PC';
        } else if (userAgent.includes('Linux')) {
            deviceName = 'Linux PC';
        }

        return { browser, os, deviceName };
    }
}
