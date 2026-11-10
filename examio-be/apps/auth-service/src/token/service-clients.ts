import { createHash, timingSafeEqual } from 'crypto';

const SHA256_HEX = /^[0-9a-f]{64}$/i;
const CLIENT_NAME = /^[a-z][a-z0-9-]*$/;

/** Audiences a service token may target (the service names). */
export const SERVICE_AUDIENCES: ReadonlySet<string> = new Set([
    'auth',
    'finance',
    'admin',
    'r2',
    'gateway',
    'vocabulary',
    'document',
    'ai',
]);

const sha256 = (value: string): Buffer =>
    createHash('sha256').update(value).digest();

/** Registry of service clients: name -> sha256(secret). Secrets are never stored. */
export class ServiceClients {
    private static readonly DUMMY = sha256('no-such-client');

    constructor(private readonly hashes: ReadonlyMap<string, Buffer>) {}

    /** Constant-time; an unknown client costs the same as a wrong secret. */
    authenticate(clientId: string, secret: string): boolean {
        if (typeof clientId !== 'string' || typeof secret !== 'string') return false;
        const expected = this.hashes.get(clientId);
        const matches = timingSafeEqual(
            sha256(secret),
            expected ?? ServiceClients.DUMMY
        );
        return matches && expected !== undefined;
    }
}

/** Parses `SERVICE_CLIENTS` (`{"<name>": "<sha256-hex>"}`); fails fast on bad config. */
export function parseServiceClients(raw: string | undefined): ServiceClients {
    if (!raw) throw new Error('SERVICE_CLIENTS is required (JSON {"<name>":"<sha256-hex>"})');
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('SERVICE_CLIENTS is not valid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('SERVICE_CLIENTS must be a JSON object of name -> sha256 hex');
    }
    const hashes = new Map<string, Buffer>();
    for (const [name, hash] of Object.entries(parsed)) {
        if (!CLIENT_NAME.test(name)) {
            throw new Error(`SERVICE_CLIENTS has an invalid client name "${name}"`);
        }
        if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) {
            throw new Error(`SERVICE_CLIENTS entry "${name}" must be a sha256 hex digest`);
        }
        hashes.set(name, Buffer.from(hash, 'hex'));
    }
    return new ServiceClients(hashes);
}
