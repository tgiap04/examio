import {
    Controller,
    Post,
    Body,
    UseGuards,
    Req,
    Get,
    Res,
    UnauthorizedException,
    BadRequestException,
    HttpCode,
    HttpStatus,
    Param,
    UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthService, DeviceInfo } from './auth.service';
import { RedisService } from '@examio/redis';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, LoginResponse } from './dto/login.dto';
import {
    ApiTags,
    ApiResponse,
    ApiOperation,
    ApiExtraModels,
    ApiCookieAuth,
} from '@nestjs/swagger';
import {
    GoogleAuthGuard,
    accessTokenCookie,
    clearAuthCookies,
    refreshTokenCookie,
    TurnstileService,
} from '@examio/common';
import {
    AllowUnverified,
    Authenticated,
    Public,
    type AuthUser,
} from '@examio/auth-jwt';
import { StrictThrottle } from './auth/guards/strict-throttle.decorator';
import {
    AuthenticatedRequest,
    AuthenticatedOauthRequest,
} from './dto/request-with-auth.dto';
import { Response as ExpressResponse, Request } from 'express';
import {
    LoginResponseDto,
    RegisterResponseDto,
    LogoutResponseDto,
    AuthMessageResponseDto,
    GetUserResponseDto,
    RefreshTokenResponseDto,
} from './dto/auth-response.dto';
import * as crypto from 'crypto';

@ApiTags('Auth')
@ApiExtraModels(
    RegisterDto,
    LoginDto,
    RegisterResponseDto,
    LoginResponseDto,
    LogoutResponseDto,
    AuthMessageResponseDto,
    GetUserResponseDto,
    RefreshTokenResponseDto
)
@Controller('auth')
export class AuthController {
    private readonly EXCHANGE_CODE_TTL = 60; // 60 seconds

    constructor(
        private readonly authService: AuthService,
        private readonly redisService: RedisService,
        private readonly turnstileService: TurnstileService
    ) {}

    private async ensureOauthSession(
        request: Request,
        oauthUser: AuthenticatedOauthRequest['user']
    ): Promise<{ token: string; sessionId?: string; refreshToken?: string; user?: any }> {
        if (oauthUser.token && oauthUser.sessionId && oauthUser.refreshToken) {
            return {
                token: oauthUser.token,
                sessionId: oauthUser.sessionId,
                refreshToken: oauthUser.refreshToken,
                user: oauthUser.user,
            };
        }

        const deviceInfo = this.extractDeviceInfo(request);
        const session = await this.authService.createSession(
            oauthUser.user.id,
            deviceInfo
        );

        // The passport strategy has no device info, so the token is issued
        // here, once the session (its `sid` claim) exists.
        const { token } = await this.authService.issueAccess(
            oauthUser.user.id,
            session.sessionId
        );

        return {
            token,
            user: oauthUser.user,
            sessionId: session.sessionId,
            refreshToken: session.refreshToken,
        };
    }

    private parseOAuthState(state?: string): {
        redirect?: string;
        nonce?: string;
    } {
        if (!state) {
            return {};
        }

        try {
            const parsed = JSON.parse(
                Buffer.from(state, 'base64url').toString('utf8')
            );

            return {
                redirect:
                    typeof parsed?.redirect === 'string'
                        ? parsed.redirect
                        : undefined,
                nonce:
                    typeof parsed?.nonce === 'string'
                        ? parsed.nonce
                        : undefined,
            };
        } catch {
            return {};
        }
    }

    private resolveFrontendTarget(frontendUrl: string, redirectPath?: string) {
        const safeRedirect =
            redirectPath && redirectPath.startsWith('/') ? redirectPath : null;

        return `${frontendUrl}${safeRedirect || '/k'}`;
    }

    /**
     * Check whether an app-scheme/absolute redirect target is on the
     * OAUTH_ALLOWED_APP_REDIRECTS allowlist. Prevents an open-redirect →
     * account-takeover where an attacker supplies an arbitrary absolute URL
     * (e.g. https://evil.com) as the OAuth redirect target and receives a
     * one-time token exchange code.
     */
    private isAllowedAppRedirect(appCallback: string): boolean {
        const allowlist = (process.env.OAUTH_ALLOWED_APP_REDIRECTS || '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);

        if (allowlist.length === 0) {
            return false;
        }

        let target: URL;
        try {
            target = new URL(appCallback);
        } catch {
            return false;
        }

        return allowlist.some((allowed) => {
            try {
                const allowedUrl = new URL(
                    allowed.includes('://') ? allowed : `${allowed}://`
                );
                const isCustomScheme = !['http:', 'https:'].includes(
                    allowedUrl.protocol
                );
                if (isCustomScheme) {
                    return target.protocol === allowedUrl.protocol;
                }
                return target.origin === allowedUrl.origin;
            } catch {
                return false;
            }
        });
    }

    @Post('register')
    @Public()
    @UsePipes(ZodValidationPipe)
    @StrictThrottle()
    @ApiOperation({ summary: 'Register a new user' })
    @ApiResponse({
        status: 201,
        description: 'User registered successfully',
        type: RegisterResponseDto,
    })
    async register(
        @Body() registerDto: RegisterDto,
        @Res({ passthrough: true }) res: ExpressResponse,
        @Req() request: Request
    ) {
        // Verify Turnstile token. Mandatory in production — a missing token
        // must not silently skip the captcha check.
        if (
            process.env.NODE_ENV === 'production' &&
            !registerDto.turnstileToken
        ) {
            throw new BadRequestException('Captcha verification required');
        }
        if (registerDto.turnstileToken) {
            await this.turnstileService.verify(registerDto.turnstileToken);
        }

        // Extract device info from request
        const deviceInfo = this.extractDeviceInfo(request);

        const {
            token,
            user,
            roles,
            permissions,
            success,
            sessionId,
            refreshToken,
            deviceId,
            message,
        } = await this.authService.register(registerDto, deviceInfo);

        // Set cookies like login does
        res.cookie('accessToken', token, accessTokenCookie());
        if (refreshToken) {
            res.cookie('refreshToken', refreshToken, refreshTokenCookie());
        }

        return {
            message,
            user,
            roles,
            permissions,
            success,
            token,
            refreshToken,
            deviceId,
        };
    }

    @Post('login')
    @Public()
    @UsePipes(ZodValidationPipe)
    @StrictThrottle()
    @ApiOperation({
        summary: 'Login a user',
        description:
            'Đăng nhập và tự động set JWT token vào cookie. Sau khi login thành công, các API có khóa sẽ tự động authenticate qua cookie.',
    })
    @ApiResponse({
        status: 200,
        description:
            'User logged in successfully. JWT token is automatically stored in cookie.',
        type: LoginResponseDto,
    })
    async login(
        @Body() loginDto: LoginDto,
        @Res({ passthrough: true }) res: ExpressResponse,
        @Req() request: Request
    ): Promise<LoginResponse> {
        // Verify Turnstile token. Mandatory in production — a missing token
        // must not silently skip the captcha check.
        if (
            process.env.NODE_ENV === 'production' &&
            !loginDto.turnstileToken
        ) {
            throw new BadRequestException('Captcha verification required');
        }
        if (loginDto.turnstileToken) {
            await this.turnstileService.verify(loginDto.turnstileToken);
        }

        // Extract device info from request
        const deviceInfo = this.extractDeviceInfo(request);

        const {
            token,
            user,
            roles,
            permissions,
            success,
            sessionId,
            refreshToken,
            deviceId,
        } = await this.authService.login(loginDto, deviceInfo);

        res.cookie('accessToken', token, accessTokenCookie());
        if (refreshToken) {
            res.cookie('refreshToken', refreshToken, refreshTokenCookie());
        }

        return {
            user,
            roles,
            permissions,
            success,
            token,
            refreshToken,
            deviceId,
        };
    }

    @Post('logout')
    @ApiOperation({ summary: 'Logout a user' })
    @ApiResponse({
        status: 200,
        description: 'User logged out successfully',
        type: LogoutResponseDto,
    })
    @Authenticated()
    @AllowUnverified()
    @ApiCookieAuth('cookie-auth')
    async logout(
        @Req() request: Request & { user: AuthUser },
        @Res({ passthrough: true }) response: ExpressResponse
    ) {

        // The session is the token's own `sid` claim, not a client cookie.
        await this.authService.logout(request.user.sid);

        // Clear cookies
        clearAuthCookies(response);
        return { success: true };
    }

    @Post('refresh')
    @Public()
    @ApiOperation({ summary: 'Refresh access token using refresh token' })
    @ApiResponse({
        status: 200,
        description: 'New access token generated',
        type: RefreshTokenResponseDto,
    })
    async refreshToken(
        @Req() request: Request,
        @Body('refreshToken') refreshTokenFromBody: string | undefined,
        @Res({ passthrough: true }) response: ExpressResponse
    ) {
        // Extract refresh token from cookie
        const refreshToken =
            request.cookies?.refreshToken ||
            refreshTokenFromBody ||
            request.body?.refreshToken;

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token not found');
        }

        try {
            const result =
                await this.authService.refreshAccessToken(refreshToken);

            // Set new access token
            response.cookie('accessToken', result.token, accessTokenCookie());

            return {
                success: true,
                token: result.token,
                refreshToken: result.refreshToken,
                user: result.user,
                roles: result.roles,
                permissions: result.permissions,
            };
        } catch (error) {
            // Keep a deliberate 401 (e.g. ACCOUNT_DISABLED) intact.
            if (error instanceof UnauthorizedException) throw error;
            throw new UnauthorizedException('Invalid or expired refresh token');
        }
    }

    @Post('sendVerificationEmail')
    @ApiOperation({ summary: 'Send verification email' })
    @ApiResponse({
        status: 200,
        description: 'Verification email sent successfully',
        type: AuthMessageResponseDto,
    })
    @Authenticated()
    @AllowUnverified()
    @ApiCookieAuth('cookie-auth')
    async sendVerificationEmail(@Req() req: AuthenticatedRequest) {
        return this.authService.sendVerificationEmail(req.user.id);
    }

    @Post('verifyAccount')
    @ApiOperation({ summary: 'Verify user account' })
    @ApiResponse({
        status: 200,
        description: 'User account verified successfully',
        type: AuthMessageResponseDto,
    })
    @Authenticated()
    @AllowUnverified()
    @StrictThrottle()
    @ApiCookieAuth('cookie-auth')
    async verifyAccount(
        @Body('code') code: string,
        @Req() req: AuthenticatedRequest,
        @Req() request: Request,
        @Res({ passthrough: true }) res: ExpressResponse
    ) {
        const result = await this.authService.verifyAccount(
            req.user.id,
            code,
            req.user.sid
        );

        // The old access token still says email_verified=false: swap it now.
        res.cookie('accessToken', result.token, accessTokenCookie());
        return result;
    }

    @Post('send-code-reset-password')
    @Public()
    @StrictThrottle()
    @ApiOperation({ summary: 'Send code to reset password' })
    @ApiResponse({
        status: 200,
        description: 'Code sent successfully',
        type: AuthMessageResponseDto,
    })
    async sendCodeResetPassword(@Body('email') email: string) {
        return this.authService.sendCodeToResetPassword(email);
    }

    @Post('reset-password')
    @Public()
    @StrictThrottle()
    @ApiOperation({ summary: 'Reset user password' })
    @ApiResponse({
        status: 200,
        description: 'Password reset successfully',
        type: AuthMessageResponseDto,
    })
    async resetPassword(
        @Body('email') email: string,
        @Body('code') code: string,
        @Body('newPassword') newPassword: string
    ) {
        return this.authService.resetPassword(email, code, newPassword);
    }

    @Post('send-code-change-password')
    @ApiOperation({ summary: 'Send code to change password (authenticated)' })
    @ApiResponse({
        status: 200,
        description: 'Code sent successfully',
        type: AuthMessageResponseDto,
    })
    @Authenticated()
    @AllowUnverified()
    @StrictThrottle()
    @ApiCookieAuth('cookie-auth')
    async sendCodeChangePassword(@Req() req: AuthenticatedRequest) {
        return this.authService.sendCodeToChangePassword(req.user.id);
    }

    @Post('change-password')
    @ApiOperation({ summary: 'Change user password (authenticated)' })
    @ApiResponse({
        status: 200,
        description: 'Password changed successfully',
        type: AuthMessageResponseDto,
    })
    @Authenticated()
    @AllowUnverified()
    @StrictThrottle()
    @ApiCookieAuth('cookie-auth')
    async changePassword(
        @Body('code') code: string,
        @Body('currentPassword') currentPassword: string,
        @Body('newPassword') newPassword: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.authService.changePassword(
            req.user.id,
            code,
            currentPassword,
            newPassword
        );
    }

    @Get('google')
    @Public()
    @UseGuards(GoogleAuthGuard)
    @ApiOperation({ summary: 'Đăng nhập Google OAuth' })
    async googleAuth(@Req() req) {
        // Khởi tạo Google OAuth flow
    }

    @Post('google/one-tap')
    @Public()
    @StrictThrottle()
    @ApiOperation({ summary: 'Đăng nhập Google One Tap' })
    async googleOneTap(
        @Body() body: { credential: string; utmSource?: string },
        @Req() request: Request,
        @Res({ passthrough: true }) res: ExpressResponse
    ) {
        const deviceInfo: DeviceInfo = {
            deviceId: request.headers['x-device-id'] as string,
            userAgent: request.headers['user-agent'],
        };
        const result = await this.authService.googleOneTapLogin(
            body.credential,
            deviceInfo,
            body.utmSource
        );

        res.cookie('accessToken', result.token, accessTokenCookie());
        if (result.refreshToken) {
            res.cookie('refreshToken', result.refreshToken, refreshTokenCookie());
        }

        return result;
    }

    @Get('google/callback')
    @Public()
    @UseGuards(GoogleAuthGuard)
    @ApiOperation({ summary: 'Google OAuth callback' })
    async googleAuthRedirect(
        @Req() req: AuthenticatedOauthRequest,
        @Res({ passthrough: true }) res: ExpressResponse,
        @Req() request: Request
    ) {
        // Verify the OAuth state nonce BEFORE creating any session. The
        // nonce was generated server-side in GoogleAuthGuard and bound to a
        // short-lived httpOnly cookie on the initiation request; requiring
        // it to match here prevents login-CSRF/session-fixation (an
        // attacker cannot forge a valid state without also controlling the
        // victim's oauth_nonce cookie).
        const oauthState = this.parseOAuthState(
            request.query.state as string | undefined
        );
        const nonceCookie = request.cookies?.oauth_nonce;
        res.clearCookie('oauth_nonce');

        if (
            !nonceCookie ||
            !oauthState.nonce ||
            nonceCookie !== oauthState.nonce
        ) {
            throw new UnauthorizedException('Invalid OAuth state');
        }

        const oauthPayload = await this.ensureOauthSession(request, req.user);
        const { token, sessionId, refreshToken, user } = oauthPayload;

        res.cookie('accessToken', token, accessTokenCookie());
        if (refreshToken) {
            res.cookie('refreshToken', refreshToken, refreshTokenCookie());
        }

        const frontendUrl = (
            process.env.FRONTEND_URL || 'http://localhost:3001'
        ).replace(/\/+$/, '');
        const redirectFromCookie = request.cookies?.oauth_redirect;
        res.clearCookie('oauth_redirect');

        const appCallback = redirectFromCookie || oauthState.redirect;

        // If redirect target is a mobile app scheme (e.g. "examio://auth/callback"),
        // store tokens in Redis with a one-time exchange code and redirect with ?code=
        // This prevents tokens from appearing in URL, server logs, and Referer headers.
        // Only allow this branch for allowlisted schemes/origins — otherwise an
        // attacker-supplied absolute URL would receive a live exchange code
        // (open-redirect → account-takeover). Anything not allowlisted falls
        // through to resolveFrontendTarget(), which already rejects non-path
        // targets and redirects to the safe default instead.
        if (appCallback && this.isAllowedAppRedirect(appCallback)) {
            try {
                const exchangeCode = crypto.randomBytes(32).toString('hex');
                // Store tokens in Redis with 60s TTL — one-time use
                await this.redisService.set(
                    `oauth:exchange:${exchangeCode}`,
                    JSON.stringify({
                        token,
                        refreshToken,
                        sessionId,
                        userId: user?.id,
                    }),
                    this.EXCHANGE_CODE_TTL
                );
                const url = new URL(appCallback);
                url.searchParams.set('code', exchangeCode);
                res.redirect(302, url.toString());
                return;
            } catch {
                // fall through to web redirect
            }
        }

        res.redirect(
            this.resolveFrontendTarget(
                frontendUrl,
                appCallback
            )
        );
    }

    @Get('me')
    @Authenticated()
    @AllowUnverified()
    @ApiOperation({ summary: 'Lấy thông tin người dùng hiện tại' })
    @ApiCookieAuth('cookie-auth')
    @ApiResponse({
        status: 200,
        description: 'User information retrieved successfully',
        type: GetUserResponseDto,
    })
    async getUser(@Req() req: AuthenticatedRequest) {
        return this.authService.getUser(req.user.id, req.user.roles);
    }

    @Post('sync-refresh-token')
    @Authenticated()
    @AllowUnverified()
    @ApiOperation({ summary: 'Đồng bộ lại refresh token từ session hiện tại' })
    @ApiCookieAuth('cookie-auth')
    async syncRefreshToken(
        @Req() req: AuthenticatedRequest,
        @Req() request: Request,
        @Res({ passthrough: true }) response: ExpressResponse
    ) {
        const result = await this.authService.syncRefreshTokenBySession(
            req.user.id,
            req.user.sid
        );

        response.cookie('refreshToken', result.refreshToken, refreshTokenCookie());

        return {
            success: true,
            refreshToken: result.refreshToken,
        };
    }

    private extractDeviceInfo(request: Request): DeviceInfo {
        // Get device ID from header or generate fallback
        let deviceId = request.headers['x-device-id'] as string;
        if (!deviceId) {
            // Fallback: generate from User-Agent + IP + timestamp
            const userAgent = request.headers['user-agent'] || '';
            const ip = this.getClientIp(request);
            deviceId = crypto
                .createHash('md5')
                .update(`${userAgent}-${ip}-${Date.now()}`)
                .digest('hex');
        }

        return {
            deviceId,
            userAgent: request.headers['user-agent'],
            ipAddress: this.getClientIp(request),
        };
    }

    private getClientIp(request: Request): string | undefined {
        // Check for proxy headers
        const forwardedFor = request.headers['x-forwarded-for'];
        if (forwardedFor) {
            const ips = (forwardedFor as string).split(',');
            return ips[0].trim();
        }

        const realIp = request.headers['x-real-ip'] as string;
        if (realIp) {
            return realIp;
        }

        return request.ip;
    }

    /**
     * Exchange a one-time OAuth code for tokens.
     * The code is stored in Redis with a 60-second TTL and is deleted after use.
     * This prevents tokens from leaking via URL, server logs, or Referer headers.
     */
    @Post('exchange')
    @Public()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Exchange OAuth code for tokens (mobile app)' })
    @ApiResponse({ status: 200, description: 'Tokens exchanged successfully' })
    @ApiResponse({ status: 401, description: 'Invalid or expired exchange code' })
    async exchangeOAuthCode(
        @Body('code') code: string
    ): Promise<{
        token: string;
        refreshToken: string;
        sessionId: string;
        userId: string;
    }> {
        if (!code) {
            throw new UnauthorizedException('Exchange code is required');
        }

        const key = `oauth:exchange:${code}`;
        const data = await this.redisService.get<string>(key);

        if (!data) {
            throw new UnauthorizedException(
                'Invalid or expired exchange code'
            );
        }

        // Delete immediately — one-time use
        await this.redisService.del(key);

        try {
            const parsed = JSON.parse(data) as {
                token: string;
                refreshToken: string;
                sessionId: string;
                userId: string;
            };
            return parsed;
        } catch {
            throw new UnauthorizedException('Malformed exchange data');
        }
    }
}
