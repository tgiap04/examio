import {
    audienceFromEnv,
    createTokenVerifier,
    issuerFromEnv,
    type TokenVerifier,
} from '@kmaedu/auth-jwt';

export const EDGE_VERIFIER = Symbol('GATEWAY_EDGE_VERIFIER');

/**
 * Verifies end-user access tokens against auth's JWKS. The accepted audience is
 * `JWT_AUDIENCE` only: a service token (`aud = <service>`) fails here with
 * TOKEN_INVALID, so an internal credential can never be replayed at the edge.
 */
export function createEdgeVerifier(env: NodeJS.ProcessEnv = process.env): TokenVerifier {
    const fallback = `${env.AUTH_SERVICE_URL || 'http://localhost:3001'}/.well-known/jwks.json`;
    const jwksUrl = env.AUTH_JWKS_URL || (env.NODE_ENV === 'production' ? undefined : fallback);
    if (!jwksUrl) throw new Error('AUTH_JWKS_URL is required');
    return createTokenVerifier({
        jwksUrl,
        issuer: issuerFromEnv(),
        audiences: [audienceFromEnv()],
    });
}
