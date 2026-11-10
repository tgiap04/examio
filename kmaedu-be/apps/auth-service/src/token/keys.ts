import {
    KeyObject,
    createPrivateKey,
    createPublicKey,
} from 'crypto';
import type { JSONWebKeySet, JWK } from 'jose';

export interface SigningKeys {
    kid: string;
    privateKey: KeyObject;
    /** Current public key first, then retired public keys (rotation window). */
    jwks: JSONWebKeySet;
}

type KeyEnv = Partial<
    Record<
        'JWT_PRIVATE_KEY' | 'JWT_KID' | 'JWT_RETIRED_PUBLIC_KEYS',
        string | undefined
    >
>;

const MIN_RSA_BITS = 2048;

/** Env vars carry PEMs on one line with literal `\n`; real newlines pass through. */
function normalisePem(value: string): string {
    return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

function publicJwk(key: KeyObject, kid: string): JWK {
    // Only the RSA public members are copied: nothing private can leak.
    const pub = key.type === 'private' ? createPublicKey(key) : key;
    const { n, e } = pub.export({ format: 'jwk' });
    return { kty: 'RSA', n, e, kid, use: 'sig', alg: 'RS256' };
}

function assertRsa(key: KeyObject, source: string): void {
    const bits = key.asymmetricKeyDetails?.modulusLength;
    if (key.asymmetricKeyType !== 'rsa' || !bits || bits < MIN_RSA_BITS) {
        throw new Error(`${source} must be an RSA key of at least ${MIN_RSA_BITS} bits`);
    }
}

function retiredKeys(raw: string | undefined, currentKid: string): JWK[] {
    if (!raw) return [];
    let entries: unknown;
    try {
        entries = JSON.parse(raw);
    } catch {
        throw new Error('JWT_RETIRED_PUBLIC_KEYS is not valid JSON');
    }
    if (!Array.isArray(entries)) {
        throw new Error('JWT_RETIRED_PUBLIC_KEYS must be a JSON array of {kid, pem}');
    }
    const seen = new Set<string>([currentKid]);
    return entries.map((entry: { kid?: unknown; pem?: unknown }) => {
        if (typeof entry?.kid !== 'string' || typeof entry?.pem !== 'string') {
            throw new Error('JWT_RETIRED_PUBLIC_KEYS entries need string kid and pem');
        }
        if (seen.has(entry.kid)) {
            throw new Error(`JWT_RETIRED_PUBLIC_KEYS has a duplicate kid "${entry.kid}"`);
        }
        seen.add(entry.kid);
        let key: KeyObject;
        try {
            key = createPublicKey(normalisePem(entry.pem));
        } catch {
            throw new Error(`JWT_RETIRED_PUBLIC_KEYS entry "${entry.kid}" has an unreadable PEM`);
        }
        assertRsa(key, `JWT_RETIRED_PUBLIC_KEYS entry "${entry.kid}"`);
        return publicJwk(key, entry.kid);
    });
}

/**
 * Loads the RS256 signing key (PKCS8 PEM) and builds the JWKS. Fails fast on
 * anything missing or weak: a service that cannot sign must not boot.
 */
export function loadSigningKeys(env: KeyEnv = process.env): SigningKeys {
    const pem = env.JWT_PRIVATE_KEY;
    const kid = env.JWT_KID;
    if (!pem) throw new Error('JWT_PRIVATE_KEY is required (PKCS8 PEM, RS256)');
    if (!kid) throw new Error('JWT_KID is required');

    let privateKey: KeyObject;
    try {
        privateKey = createPrivateKey(normalisePem(pem));
    } catch {
        throw new Error('JWT_PRIVATE_KEY is not a readable PEM private key');
    }
    assertRsa(privateKey, 'JWT_PRIVATE_KEY');

    return {
        kid,
        privateKey,
        jwks: {
            keys: [
                publicJwk(privateKey, kid),
                ...retiredKeys(env.JWT_RETIRED_PUBLIC_KEYS, kid),
            ],
        },
    };
}
