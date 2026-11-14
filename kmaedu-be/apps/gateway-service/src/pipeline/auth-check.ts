import type { IncomingHttpHeaders } from 'http';
import {
    TokenVerificationError,
    extractHttpToken,
    type AuthUser,
    type TokenVerifier,
} from '@kmaedu/auth-jwt';
import type { AuthStateService } from './auth-state.service';
import type { AuthMode } from '../routing/route-config.schema';

export type AuthResult =
    | { kind: 'user'; user: AuthUser; token: string }
    /** `stripToken`: a credential was present but unusable and must not be forwarded. */
    | { kind: 'anonymous'; stripToken: boolean }
    | { kind: 'reject'; status: 401 | 503; code: string };

export interface AuthDeps {
    verify: TokenVerifier;
    state: Pick<AuthStateService, 'check'>;
}

const REJECTS = {
    revoked: { status: 401, code: 'SESSION_REVOKED' },
    stale: { status: 401, code: 'TOKEN_STALE' },
    unavailable: { status: 503, code: 'AUTH_STATE_UNAVAILABLE' },
} as const;

/**
 * Steps 2-4 of the pipeline: extract the token (bearer, then `accessToken`
 * cookie; never the query string), verify it, and consult the revoke / `av`
 * state. `optional` routes never reject: an unusable credential is stripped and
 * the request continues anonymously (RT-6).
 */
export async function authenticate(
    headers: IncomingHttpHeaders,
    mode: Exclude<AuthMode, 'none'>,
    req: { method: string; pathname: string },
    deps: AuthDeps
): Promise<AuthResult> {
    const optional = mode === 'optional';
    const fail = (status: 401 | 503, code: string): AuthResult =>
        optional
            ? { kind: 'anonymous', stripToken: true }
            : { kind: 'reject', status, code };

    const token = extractHttpToken({ headers });
    if (!token) {
        return optional
            ? { kind: 'anonymous', stripToken: false }
            : { kind: 'reject', status: 401, code: 'TOKEN_MISSING' };
    }

    let user: AuthUser;
    try {
        const principal = await deps.verify(token);
        // A service token is never an edge credential.
        if (principal.kind !== 'user') return fail(401, 'TOKEN_INVALID');
        user = principal;
    } catch (err) {
        return fail(
            401,
            err instanceof TokenVerificationError ? err.code : 'TOKEN_INVALID'
        );
    }

    const verdict = await deps.state.check(user, req);
    if (verdict !== 'ok') return fail(REJECTS[verdict].status, REJECTS[verdict].code);
    return { kind: 'user', user, token };
}
