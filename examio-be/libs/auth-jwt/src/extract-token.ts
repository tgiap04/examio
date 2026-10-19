import type { Metadata } from '@grpc/grpc-js';
import { parse as parseCookie } from 'cookie';

const BEARER = 'Bearer ';

function bearerOf(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.startsWith(BEARER)) return undefined;
    return value.slice(BEARER.length).trim() || undefined;
}

interface HeaderCarrier {
    headers: Record<string, string | string[] | undefined>;
}

/** HTTP token order: Bearer header, then cookie `accessToken`. Never the query string. */
export function extractHttpToken(request: HeaderCarrier): string | undefined {
    const fromHeader = bearerOf(request.headers.authorization);
    if (fromHeader) return fromHeader;

    const rawCookie = request.headers.cookie;
    if (typeof rawCookie !== 'string' || !rawCookie) return undefined;
    const cookies = parseCookie(rawCookie);
    return cookies.accessToken || undefined;
}

/** gRPC: the forwarded or service token travels in `authorization` metadata. */
export function extractRpcToken(
    metadata: Metadata | undefined
): string | undefined {
    if (!metadata || typeof metadata.get !== 'function') return undefined;
    return bearerOf(metadata.get('authorization')[0]);
}
