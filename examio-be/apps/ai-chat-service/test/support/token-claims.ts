import { Metadata } from '@grpc/grpc-js';

export interface CallerClaims {
    sub: string;
    aud: string[];
}

/** The `sub` / `aud` of the bearer token of a gRPC call (the fakes read the caller from the token, no signature check). */
export function callerOf(metadata: Metadata): CallerClaims {
    const bearer = String(metadata.get('authorization')[0] ?? '').replace(/^Bearer /, '');
    const payload = bearer.split('.')[1];
    if (!payload) return { sub: '', aud: [] };
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string; aud?: string | string[] };
    return { sub: claims.sub ?? '', aud: ([] as string[]).concat(claims.aud ?? []) };
}
