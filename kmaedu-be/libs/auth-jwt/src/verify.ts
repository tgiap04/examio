import { Logger } from '@nestjs/common';
import {
    createLocalJWKSet,
    createRemoteJWKSet,
    errors as joseErrors,
    jwtVerify,
    type JSONWebKeySet,
    type JWTPayload,
} from 'jose';
import { TokenVerificationError } from './auth-errors';
import { isRole, type Role } from './permissions';
import {
    ACCESS_TOKEN_TYP,
    SERVICE_ROLE,
    SERVICE_SUBJECT_PREFIX,
    type Principal,
} from './types';

export type JwksSource =
    | { jwksUrl: string; cooldownMs?: number; cacheMaxAgeMs?: number }
    | { localJwks: JSONWebKeySet };

export type VerifierOptions = JwksSource & {
    issuer: string;
    /** Accepted `aud` values (the user audience plus this service's name). */
    audiences: string[];
};

export type TokenVerifier = (token: string) => Promise<Principal>;

const logger = new Logger('TokenVerifier');

/**
 * Stateless access-token verifier: RS256 only, `typ=at+jwt`, issuer and
 * audience pinned. No DB, no session lookup. Remote JWKS are cached by jose
 * and refetched on an unknown `kid` (rotation), subject to the cooldown.
 */
export function createTokenVerifier(options: VerifierOptions): TokenVerifier {
    const keySet =
        'localJwks' in options
            ? createLocalJWKSet(options.localJwks)
            : createRemoteJWKSet(new URL(options.jwksUrl), {
                  cooldownDuration: options.cooldownMs ?? 30_000,
                  cacheMaxAge: options.cacheMaxAgeMs ?? 10 * 60_000,
                  timeoutDuration: 3_000,
              });

    return async (token: string): Promise<Principal> => {
        let payload: JWTPayload;
        try {
            ({ payload } = await jwtVerify(token, keySet, {
                algorithms: ['RS256'],
                typ: ACCESS_TOKEN_TYP,
                issuer: options.issuer,
                audience: options.audiences,
                // A signed token with no expiry or issue time must never verify.
                requiredClaims: ['exp', 'iat'],
            }));
        } catch (err) {
            throw toVerificationError(err);
        }
        return toPrincipal(payload);
    };
}

function toVerificationError(err: unknown): TokenVerificationError {
    if (err instanceof joseErrors.JWTExpired) {
        return new TokenVerificationError('TOKEN_EXPIRED');
    }
    // Infrastructure trouble (JWKS unreachable / timed out) is not the
    // caller's fault but must still fail closed; leave a trace for operators.
    if (
        err instanceof joseErrors.JWKSTimeout ||
        !(err instanceof joseErrors.JOSEError)
    ) {
        logger.warn(
            `JWKS lookup failed: ${err instanceof Error ? err.message : String(err)}`
        );
    }
    return new TokenVerificationError('TOKEN_INVALID');
}

function invalid(): never {
    throw new TokenVerificationError('TOKEN_INVALID');
}

function toPrincipal(payload: JWTPayload): Principal {
    const { sub, roles } = payload;
    if (typeof sub !== 'string' || !sub) invalid();
    if (!Array.isArray(roles) || roles.length === 0) invalid();
    if (!roles.every((r): r is string => typeof r === 'string')) invalid();

    const isServiceRole = roles.includes(SERVICE_ROLE);
    const isServiceSubject = sub.startsWith(SERVICE_SUBJECT_PREFIX);
    if (isServiceRole !== isServiceSubject) invalid();

    if (isServiceRole) {
        const name = sub.slice(SERVICE_SUBJECT_PREFIX.length);
        if (roles.length !== 1 || !name) invalid();
        return { kind: 'service', name };
    }

    const { sid, av, email_verified: emailVerified } = payload;
    if (typeof sid !== 'string' || !sid) invalid();
    if (typeof av !== 'number' || !Number.isInteger(av) || av < 0) invalid();
    if (typeof emailVerified !== 'boolean') invalid();
    if (!roles.every(isRole)) invalid();

    return {
        kind: 'user',
        id: sub,
        sid,
        roles: roles as Role[],
        emailVerified,
        av,
    };
}
