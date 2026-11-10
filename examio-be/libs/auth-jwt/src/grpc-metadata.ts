import { Injectable } from '@nestjs/common';
import type { Metadata } from '@grpc/grpc-js';
import { buildMetadata } from '@examio/grpc';
import { extractHttpToken } from './extract-token';
import { ServiceTokenClient } from './service-token.client';

interface RequestLike {
    headers: Record<string, string | string[] | undefined>;
}

function requestIdOf(req: RequestLike): string | undefined {
    const header = req.headers['x-request-id'];
    return (Array.isArray(header) ? header[0] : header) || undefined;
}

/**
 * Metadata that forwards the caller's own access token (user-originated RPC:
 * the downstream verifies it and takes the actor from `sub`). Never builds
 * bare `x-user-*` headers and never carries a body actor.
 */
export function forwardUser(req: RequestLike): Metadata {
    const token = extractHttpToken(req);
    return buildMetadata({
        authorization: token ? `Bearer ${token}` : undefined,
        requestId: requestIdOf(req),
    });
}

/** Service-originated RPC (events, cron, background work): a cached service token. */
@Injectable()
export class ServiceMetadata {
    constructor(private readonly tokens: ServiceTokenClient) {}

    async asService(audience: string, requestId?: string): Promise<Metadata> {
        return buildMetadata({
            authorization: `Bearer ${await this.tokens.getToken(audience)}`,
            requestId,
        });
    }

    /**
     * Returns a copy of `metadata` carrying a service token for `audience`
     * unless it already has an `authorization` entry (a forwarded user token
     * wins). Keeps the caller's `x-request-id`.
     */
    async attach(metadata: Metadata, audience: string): Promise<Metadata> {
        const copy = metadata.clone();
        if (copy.get('authorization').length === 0) {
            copy.set('authorization', `Bearer ${await this.tokens.getToken(audience)}`);
        }
        return copy;
    }
}
