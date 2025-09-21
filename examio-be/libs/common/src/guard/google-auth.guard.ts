import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
    canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const redirect = request.query?.redirect;

        if (typeof redirect === 'string') {
            const isProduction = process.env.NODE_ENV === 'production';
            const cookieDomain = isProduction
                ? process.env.COOKIE_DOMAIN || '.examio.top'
                : undefined;

            response.cookie('oauth_redirect', redirect, {
                httpOnly: true,
                sameSite: 'lax',
                secure: isProduction,
                maxAge: 10 * 60 * 1000,
                ...(cookieDomain && { domain: cookieDomain }),
            });
        }

        return super.canActivate(context);
    }

    getAuthenticateOptions(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();
        const state = request.query?.state;

        return typeof state === 'string' ? { state } : {};
    }
}
