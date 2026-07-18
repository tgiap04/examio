import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import * as crypto from 'crypto';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
    canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const redirect = request.query?.redirect;
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieDomain = isProduction
            ? process.env.COOKIE_DOMAIN || '.examio.top'
            : undefined;

        if (typeof redirect === 'string') {
            response.cookie('oauth_redirect', redirect, {
                httpOnly: true,
                sameSite: 'lax',
                secure: isProduction,
                maxAge: 10 * 60 * 1000,
                ...(cookieDomain && { domain: cookieDomain }),
            });
        }

        // Only the flow-initiation request (GET /auth/google) should mint a
        // fresh nonce. This guard also runs on the callback request (GET
        // /auth/google/callback), where `state` must be left untouched so
        // the controller can verify it against the cookie set here.
        const isInitiation = context.getHandler().name !== 'googleAuthRedirect';

        if (isInitiation) {
            // Generate a server-side nonce bound to a short-lived httpOnly
            // cookie. The nonce travels to Google embedded in `state` and
            // must come back unchanged on the callback — this binds the
            // OAuth flow to THIS browser, preventing login-CSRF/session
            // fixation where an attacker crafts/replays a callback with a
            // state value the victim's browser never actually requested.
            const nonce = crypto.randomBytes(32).toString('hex');
            response.cookie('oauth_nonce', nonce, {
                httpOnly: true,
                sameSite: 'lax',
                secure: isProduction,
                maxAge: 10 * 60 * 1000,
                ...(cookieDomain && { domain: cookieDomain }),
            });

            request.query.state = this.embedNonceInState(
                request.query?.state,
                nonce
            );
        }

        return super.canActivate(context);
    }

    getAuthenticateOptions(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();
        const state = request.query?.state;

        return typeof state === 'string' ? { state } : {};
    }

    /**
     * Merge the generated nonce into whatever state payload the client
     * requested (currently `{ redirect }`, base64url-encoded JSON), so the
     * callback can recover both the redirect target and the nonce from the
     * single `state` round-trip Google provides.
     */
    private embedNonceInState(state: unknown, nonce: string): string {
        let payload: Record<string, unknown> = {};

        if (typeof state === 'string' && state.length > 0) {
            try {
                payload = JSON.parse(
                    Buffer.from(state, 'base64url').toString('utf8')
                );
            } catch {
                payload = {};
            }
        }

        payload.nonce = nonce;

        return Buffer.from(JSON.stringify(payload), 'utf8').toString(
            'base64url'
        );
    }
}
