import { Injectable } from '@nestjs/common';
import { SignJWT, type JSONWebKeySet } from 'jose';
import {
    ACCESS_TOKEN_TYP,
    SERVICE_ROLE,
    SERVICE_SUBJECT_PREFIX,
    audienceFromEnv,
    createTokenVerifier,
    issuerFromEnv,
    type Role,
    type TokenVerifier,
} from '@examio/auth-jwt';
import { loadSigningKeys } from './keys';

const SERVICE_TOKEN_TTL_SECONDS = 300;
const DEFAULT_ACCESS_TTL_SECONDS = 900;

export interface UserTokenInput {
    userId: string;
    sessionId: string;
    roles: Role[];
    emailVerified: boolean;
    authzVersion: number;
}

export interface SignedToken {
    token: string;
    expiresInSeconds: number;
}

function accessTtlSeconds(raw = process.env.ACCESS_TOKEN_EXPIRATION): number {
    if (!raw) return DEFAULT_ACCESS_TTL_SECONDS;
    const match = /^(\d+)\s*([smhd])$/.exec(raw.trim());
    if (!match) throw new Error(`ACCESS_TOKEN_EXPIRATION "${raw}" is not like 15m`);
    const unit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]] as number;
    return Number(match[1]) * unit;
}

/** Signs RS256 access/service tokens and publishes the JWKS. Owns the private key. */
@Injectable()
export class TokenService {
    private readonly keys = loadSigningKeys(process.env);
    private readonly issuer = issuerFromEnv();
    private readonly audience = audienceFromEnv();
    private readonly accessTtl = accessTtlSeconds();

    /** Auth verifies against its own keys: it never fetches its own JWKS over HTTP. */
    readonly verify: TokenVerifier = createTokenVerifier({
        localJwks: this.keys.jwks,
        issuer: this.issuer,
        audiences: [this.audience, 'auth'],
    });

    jwks(): JSONWebKeySet {
        return this.keys.jwks;
    }

    signUserToken(input: UserTokenInput): Promise<SignedToken> {
        return this.sign(
            {
                sid: input.sessionId,
                roles: input.roles,
                email_verified: input.emailVerified,
                av: input.authzVersion,
            },
            input.userId,
            this.audience,
            this.accessTtl
        );
    }

    signServiceToken(caller: string, audience: string): Promise<SignedToken> {
        return this.sign(
            { roles: [SERVICE_ROLE] },
            `${SERVICE_SUBJECT_PREFIX}${caller}`,
            audience,
            SERVICE_TOKEN_TTL_SECONDS
        );
    }

    private async sign(
        claims: Record<string, unknown>,
        subject: string,
        audience: string,
        ttlSeconds: number
    ): Promise<SignedToken> {
        const now = Math.floor(Date.now() / 1000);
        const token = await new SignJWT(claims)
            .setProtectedHeader({ alg: 'RS256', typ: ACCESS_TOKEN_TYP, kid: this.keys.kid })
            .setIssuer(this.issuer)
            .setAudience(audience)
            .setSubject(subject)
            .setIssuedAt(now)
            .setExpirationTime(now + ttlSeconds)
            .sign(this.keys.privateKey);
        return { token, expiresInSeconds: ttlSeconds };
    }
}
