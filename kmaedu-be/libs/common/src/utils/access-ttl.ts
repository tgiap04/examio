const DEFAULT_ACCESS_TTL_SECONDS = 900;
const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/**
 * Access-token lifetime from `ACCESS_TOKEN_EXPIRATION` (`15m`, `1h`, ...).
 * One definition for the signer, the access cookie and the session-revoke window.
 */
export function accessTtlSeconds(raw = process.env.ACCESS_TOKEN_EXPIRATION): number {
    if (!raw) return DEFAULT_ACCESS_TTL_SECONDS;
    const match = /^(\d+)\s*([smhd])$/.exec(raw.trim());
    if (!match) throw new Error(`ACCESS_TOKEN_EXPIRATION "${raw}" is not like 15m`);
    return Number(match[1]) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS];
}
