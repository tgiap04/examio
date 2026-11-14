import { isCanonicalR2Key, isR2Host, r2KeyFromUrl, rawR2Key } from './r2-key-from-url';

/** Owner ids are server-generated hex; anything else cannot be a safe key segment. */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function isSafeOwner(ownerId: string): boolean {
    return SAFE_SEGMENT.test(ownerId) && !ownerId.includes('..');
}

/**
 * The folder a server-issued upload for `ownerId` goes into: `<area>/<ownerId>`.
 * The full key is `<folder>/<random>-<name>`, so a key proves who it was issued to.
 */
export function ownerKeyFolder(area: string, ownerId: string): string {
    if (!isSafeOwner(ownerId)) throw new Error('Invalid R2 key owner');
    return `${area}/${ownerId}`;
}

/**
 * `key` when it lies under `<area>/<ownerId>/` for one of `areas`, else `null`.
 * Legacy owner-less keys (and anything another user could have written) fail,
 * so they are never deletable on a user's behalf.
 */
export function ownedR2Key(
    key: string | null | undefined,
    areas: readonly string[],
    ownerId: string
): string | null {
    if (!key || !isSafeOwner(ownerId) || !isCanonicalR2Key(key)) return null;
    for (const area of areas) {
        const prefix = `${area}/${ownerId}/`;
        if (key.startsWith(prefix) && key.length > prefix.length) return key;
    }
    return null;
}

/** Like {@link ownedR2Key} for a public URL; `null` for external or foreign URLs. */
export function ownedR2KeyFromUrl(
    url: string | null | undefined,
    areas: readonly string[],
    ownerId: string,
    publicBase: string | undefined = process.env.R2_PUBLIC_URL
): string | null {
    return ownedR2Key(r2KeyFromUrl(url, publicBase), areas, ownerId);
}

/**
 * True when `url` is served from our R2 host but is not a canonical key under the
 * caller's own prefix: such a value must never be accepted from a client. A
 * non-canonical key on our host (e.g. `%2e%2e` segments) counts as foreign, not as
 * external. External URLs are not ours to police and return false.
 */
export function isForeignR2Url(
    url: string | null | undefined,
    areas: readonly string[],
    ownerId: string,
    publicBase: string | undefined = process.env.R2_PUBLIC_URL
): boolean {
    const key = rawR2Key(url, publicBase);
    // Our hostname on another scheme/port/FQDN form or outside the public prefix:
    // not resolvable to a key we can check, so it is foreign, never external.
    if (key === null) return isR2Host(url, publicBase);
    return ownedR2Key(key, areas, ownerId) === null;
}
