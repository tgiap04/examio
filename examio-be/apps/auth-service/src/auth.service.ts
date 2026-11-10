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
import { Prisma, User } from './prisma';
import * as crypto from 'crypto';

// Shared libs imports
import { PrismaService } from './prisma';
import {
    MailService,
    PasswordService,
    GenerateIdService,
    generateCode,
    RefreshTokenCipherService,
} from '@examio/common';
import { OutboxService } from '@examio/messaging';
import { sanitizeUser } from './utils/sanitize-user';
import { permissionsOf, type Permission, type Role } from '@examio/auth-jwt';
import type { UserRegistered } from '@examio/contracts/generated/examio/events/v1/auth_events';

// Local imports
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { sanitizeUtmSource } from './utils/utm-source.util';
import { UserRepository } from './repositories/user.repository';
import { UserSessionRepository } from './devices/repositories/user-session.repository';
import {
    AccessTokenService,
    AccountDisabledException,
} from './token/access-token.service';
import { GatewayControlClient, sessionRevokeExp } from './clients/gateway-control.client';
import { SessionRevoker } from './devices/session-revoker.service';
import { AuthzChangedPublisher } from './roles/authz-changed.publisher';

/** Result of an OAuth login; without device info no session (and no token) exists yet. */
export interface OAuthLoginResult {
    token?: string;
    user: ReturnType<typeof sanitizeUser>;
    roles?: Role[];
    permissions?: Permission[];
    success: boolean;
    sessionId?: string;
    refreshToken?: string;
    deviceId?: string;
}

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
        private readonly accessTokens: AccessTokenService,
        private readonly mailService: MailService,
        private readonly passwordService: PasswordService,
        private readonly generateIdService: GenerateIdService,
        private readonly outbox: OutboxService,
        private readonly refreshTokenCipher: RefreshTokenCipherService,
        private readonly authzPublisher: AuthzChangedPublisher,
        private readonly gatewayControl: GatewayControlClient,
        private readonly sessionRevoker: SessionRevoker
    ) {}

    /**
     * Issues the RS256 access token for an existing session (roles + `av` read
     * under `FOR SHARE`, see AccessTokenService). A banned/deleted account is
     * rejected with 401 ACCOUNT_DISABLED and the session it came with is
     * deactivated, so the refresh token cannot be replayed.
     */
    async issueAccess(
        userId: string,
        sessionId: string,
        include?: Prisma.UserInclude
    ): Promise<{ token: string; user: User; roles: Role[]; permissions: Permission[] }> {
        try {
            return await this.accessTokens.issue(userId, sessionId, include);
        } catch (error) {
            if (error instanceof AccountDisabledException) {
                await this.deactivateBySessionId(sessionId);
            }
            throw error;
        }
    }

    private async deactivateBySessionId(sessionId: string): Promise<void> {
        try {
            const session = await this.userSessionRepository.findBySessionId(sessionId);
            if (session) await this.userSessionRepository.deactivateSession(session.id);
        } catch (error) {
            console.error('Error deactivating session of a disabled account:', error);
        }
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

    async login(loginDto: LoginDto, deviceInfo: DeviceInfo) {
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
            return await this.startSession(user.id, deviceInfo);
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

    /** Payload of `auth.user.registered` (proto `examio.events.v1.UserRegistered`). */
    private userRegisteredData(
        user: User
    ): Omit<UserRegistered, 'utmSource'> & { utmSource: string | null } {
        return {
            userId: user.id,
            email: user.email,
            username: user.username,
            utmSource: user.utmSource ?? null,
        };
    }

    async register(registerDto: RegisterDto, deviceInfo: DeviceInfo) {
        const { username, email, password } = registerDto;
        const utmSource = sanitizeUtmSource(registerDto.utmSource);
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
                        utmSource,
                    },
                });

                // STUDENT by DB default.
                await this.outbox.add(
                    tx,
                    'auth.user.registered',
                    this.userRegisteredData(user)
                );

                return user;
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

            // Auto-login: the session exists first so the token carries its sid.
            return {
                message: 'Đăng ký thành công',
                ...(await this.startSession(newUser.id, deviceInfo)),
            };
        } catch (error) {
            if (error instanceof ConflictException) {
                throw error;
            }
            console.log(error.message);
            throw new InternalServerErrorException('Đăng ký không thành công');
        }
    }

    /** Loads the full account of a token principal (claims carry only id/roles/sid). */
    private async loadUser(userId: string): Promise<User> {
        const user = await this.userRepository.findByIdWithRelations(
            userId,
            [],
            false
        );
        if (!user) throw new NotFoundException('Người dùng không tồn tại');
        return user;
    }

    async sendVerificationEmail(userId: string) {
        try {
            const user = await this.loadUser(userId);
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
            if (error instanceof NotFoundException) throw error;
            console.log(error.message);
            throw new InternalServerErrorException(
                'Gửi email không thành công'
            );
        }
    }

    /**
     * Verifies the email, then re-issues the access token for the SAME session
     * with `email_verified=true` (the old token still says false).
     */
    async verifyAccount(userId: string, code: string, sessionId: string) {
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

            const { token } = await this.issueAccess(userId, sessionId);
            return { message: 'Tài khoản đã được xác minh thành công', token };
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

            await this.rotatePassword(user, newPassword);

            // Invalidate all existing sessions so a session hijacked before
            // the reset cannot survive the credential rotation.
            await this.sessionRevoker.revokeAll(user.id);

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

    async sendCodeToChangePassword(userId: string) {
        try {
            const user = await this.loadUser(userId);
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
            if (error instanceof NotFoundException) throw error;
            console.log(error.message);
            throw new InternalServerErrorException(
                'Gửi mã xác minh không thành công'
            );
        }
    }

    async changePassword(
        userId: string,
        code: string,
        currentPassword: string,
        newPassword: string
    ) {
        try {
            const user = await this.loadUser(userId);
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

            await this.rotatePassword(user, newPassword);

            // Invalidate all existing sessions so a session hijacked before
            // the change cannot survive the credential rotation.
            await this.sessionRevoker.revokeAll(user.id);

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

    /**
     * Password update + reset-code delete + `authzVersion` bump + outbox
     * `authz_changed(reason:'password')` in ONE transaction, so every token
     * signed before the change is detectably stale.
     */
    private async rotatePassword(user: User, newPassword: string): Promise<void> {
        const password = await this.passwordService.hashPassword(newPassword);
        const authzVersion = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.user.update({
                where: { id: user.id },
                data: {
                    password,
                    authzVersion: { increment: 1 },
                    updatedBy: user.id,
                },
                select: {
                    id: true,
                    authzVersion: true,
                    role: true,
                    isSystemAdmin: true,
                    isBanned: true,
                },
            });
            await tx.resetPasswordCode.delete({ where: { userId: user.id } });
            await this.authzPublisher.publish(tx, updated, 'password');
            return updated.authzVersion;
        });
        await this.userRepository.invalidateCaches(user);
        // Fast path; the committed authz_changed(reason:'password') event is the durable one.
        await this.gatewayControl.invalidateUser(user.id, authzVersion);
    }

    private async handleOAuthLogin(
        email: string,
        username: string,
        avatar?: string,
        deviceInfo?: DeviceInfo,
        utmSource?: string | null
    ): Promise<OAuthLoginResult> {
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
                        // Chỉ gắn nguồn khi TẠO user mới (first-touch); đăng nhập lại không đụng.
                        utmSource: sanitizeUtmSource(utmSource),
                    },
                });

                await this.outbox.add(
                    tx,
                    'auth.user.registered',
                    this.userRegisteredData(user)
                );

                return user;
            });
        }

        // The access token needs a session id. Without deviceInfo (the
        // passport Google strategy) the controller creates the session and
        // calls issueAccess() itself.
        if (!deviceInfo) {
            return { user: sanitizeUser(existingUser), success: true };
        }
        return this.startSession(existingUser.id, deviceInfo);
    }

    /**
     * Creates the session, then issues the access token for it. Shared by
     * login, register and OAuth; the response carries `roles`/`permissions`
     * next to `user`.
     */
    private async startSession(userId: string, deviceInfo: DeviceInfo) {
        const session = await this.createSession(userId, deviceInfo);
        const issued = await this.issueAccess(userId, session.sessionId);
        return {
            token: issued.token,
            user: sanitizeUser(issued.user),
            roles: issued.roles,
            permissions: issued.permissions,
            success: true,
            sessionId: session.sessionId,
            refreshToken: session.refreshToken,
            deviceId: deviceInfo.deviceId,
        };
    }

    async googleLogin(
        user: any,
        deviceInfo?: DeviceInfo,
        utmSource?: string | null
    ): Promise<OAuthLoginResult> {
        const { email, picture } = user;
        const username = email.split('@')[0];
        return this.handleOAuthLogin(
            email,
            username,
            picture,
            deviceInfo,
            utmSource
        );
    }

    async googleOneTapLogin(
        credential: string,
        deviceInfo?: DeviceInfo,
        utmSource?: string | null
    ): Promise<OAuthLoginResult> {
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
        return this.handleOAuthLogin(
            email,
            username,
            picture,
            deviceInfo,
            utmSource
        );
    }


    /** `roles`/`permissions` mirror the verified token, i.e. what the APIs will enforce. */
    async getUser(userId: string, roles: Role[]) {
        // Fresh read: the account only; /auth/me never depends on another service.
        const foundUser = await this.userRepository.findByIdWithRelations(
            userId,
            [],
            false
        );
        if (!foundUser) {
            throw new NotFoundException('Người dùng không tồn tại');
        }
        return {
            user: sanitizeUser(foundUser),
            roles,
            permissions: permissionsOf(roles),
        };
    }

    async logout(sessionId: string): Promise<void> {
        try {
            // Deactivation + auth.session.revoked event in one transaction, then the gRPC fast path.
            await this.sessionRevoker.revokeBySid(sessionId);
        } catch (error) {
            console.error('Error revoking session:', error);
            // Logout must still succeed; the token must still stop working at the edge.
            await this.gatewayControl.revokeSession(sessionId, sessionRevokeExp());
        }
    }

    async refreshAccessToken(refreshToken: string): Promise<{
        token: string;
        refreshToken: string;
        user: any;
        roles: Role[];
        permissions: Permission[];
    }> {
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

        // Reload the account and sign in one FOR SHARE transaction: the token
        // carries the CURRENT role/admin flag/av, and a banned or deleted
        // account is refused (401 ACCOUNT_DISABLED) with its session revoked.
        const { token, user, roles, permissions } = await this.issueAccess(
            session.userId,
            session.sessionId
        );

        // rotateRefreshTokenIfCurrent trả về refresh
        // token hợp lệ để cấp lại: token mới nếu rotate thành công, hoặc token
        // hiện hành nếu request đến trong grace window (tab khác đã rotate).
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
            roles,
            permissions,
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
