import { generateKeyPairSync } from 'crypto';
import { loadSigningKeys } from './keys';

function pemPair(bits = 2048) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: bits,
    });
    return {
        privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
        publicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
    };
}

describe('loadSigningKeys', () => {
    it('loads a PKCS8 PEM, publishes the public JWK with kid/use/alg and no private members', () => {
        const { privatePem } = pemPair();
        const keys = loadSigningKeys({
            JWT_PRIVATE_KEY: privatePem,
            JWT_KID: 'k1',
        });
        expect(keys.kid).toBe('k1');
        expect(keys.jwks.keys).toHaveLength(1);
        const [jwk] = keys.jwks.keys;
        expect(jwk).toMatchObject({ kty: 'RSA', kid: 'k1', use: 'sig', alg: 'RS256' });
        for (const secret of ['d', 'p', 'q', 'dp', 'dq', 'qi']) {
            expect(jwk).not.toHaveProperty(secret);
        }
    });

    it('accepts a single-line PEM with escaped \\n (env friendly)', () => {
        const { privatePem } = pemPair();
        const escaped = privatePem.trim().replace(/\n/g, '\\n');
        expect(
            loadSigningKeys({ JWT_PRIVATE_KEY: escaped, JWT_KID: 'k1' }).kid
        ).toBe('k1');
    });

    it('publishes retired public keys for rotation', () => {
        const current = pemPair();
        const old = pemPair();
        const keys = loadSigningKeys({
            JWT_PRIVATE_KEY: current.privatePem,
            JWT_KID: 'new',
            JWT_RETIRED_PUBLIC_KEYS: JSON.stringify([
                { kid: 'old', pem: old.publicPem },
            ]),
        });
        expect(keys.jwks.keys.map((k) => k.kid)).toEqual(['new', 'old']);
        expect(keys.jwks.keys[1]).toMatchObject({ use: 'sig', alg: 'RS256' });
    });

    it('fails fast on missing key, missing kid, garbage, weak keys and bad retired JSON', () => {
        const { privatePem } = pemPair();
        expect(() => loadSigningKeys({ JWT_KID: 'k' })).toThrow(/JWT_PRIVATE_KEY/);
        expect(() => loadSigningKeys({ JWT_PRIVATE_KEY: privatePem })).toThrow(/JWT_KID/);
        expect(() =>
            loadSigningKeys({ JWT_PRIVATE_KEY: 'nope', JWT_KID: 'k' })
        ).toThrow(/JWT_PRIVATE_KEY/);
        expect(() =>
            loadSigningKeys({ JWT_PRIVATE_KEY: pemPair(1024).privatePem, JWT_KID: 'k' })
        ).toThrow(/2048/);
        expect(() =>
            loadSigningKeys({
                JWT_PRIVATE_KEY: privatePem,
                JWT_KID: 'k',
                JWT_RETIRED_PUBLIC_KEYS: '{not json',
            })
        ).toThrow(/JWT_RETIRED_PUBLIC_KEYS/);
        expect(() =>
            loadSigningKeys({
                JWT_PRIVATE_KEY: privatePem,
                JWT_KID: 'k',
                JWT_RETIRED_PUBLIC_KEYS: JSON.stringify([{ kid: 'k', pem: 'x' }]),
            })
        ).toThrow(/JWT_RETIRED_PUBLIC_KEYS/);
    });

    it('rejects a retired kid equal to the current kid', () => {
        const a = pemPair();
        const b = pemPair();
        expect(() =>
            loadSigningKeys({
                JWT_PRIVATE_KEY: a.privatePem,
                JWT_KID: 'same',
                JWT_RETIRED_PUBLIC_KEYS: JSON.stringify([{ kid: 'same', pem: b.publicPem }]),
            })
        ).toThrow(/duplicate/i);
    });
});
