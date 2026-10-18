import { randomUUID } from 'crypto';
import { Metadata } from '@grpc/grpc-js';

export const AUTHORIZATION_KEY = 'authorization';
export const REQUEST_ID_KEY = 'x-request-id';

export interface MetadataInput {
    /** Full header value, e.g. `Bearer <jwt>`. */
    authorization?: string;
    requestId?: string;
}

/**
 * Builds the explicit metadata every generated-client call takes. Phase 04 adds
 * the user-token / service-token builders on top of this.
 */
export function buildMetadata(input: MetadataInput = {}): Metadata {
    const md = new Metadata();
    md.set(REQUEST_ID_KEY, input.requestId ?? `req_${randomUUID()}`);
    if (input.authorization) md.set(AUTHORIZATION_KEY, input.authorization);
    return md;
}

/** Loggable view of metadata: the bearer token is never printed. */
export function redactMetadata(md: Metadata): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, values] of Object.entries(md.getMap())) {
        out[key] = key === AUTHORIZATION_KEY ? '[redacted]' : String(values);
    }
    return out;
}
