import { canonicalR2PublicBase, isCanonicalR2Key, r2KeyFromUrl, rawR2Key } from './r2-key-from-url';

const BASE = 'https://cdn.examio.test';

describe('r2KeyFromUrl', () => {
    it('returns the key for a URL on the configured R2 public host', () => {
        expect(r2KeyFromUrl(`${BASE}/word-family/a_b-1.png`, BASE)).toBe('word-family/a_b-1.png');
        // keys our server never issues (space) are not resolvable for deletion
        expect(r2KeyFromUrl(`${BASE}/word-family/a b.png`, BASE)).toBeNull();
        expect(r2KeyFromUrl(`${BASE}/avatars/u1/a.png?v=2#x`, `${BASE}/`)).toBe('avatars/u1/a.png');
    });

    it('supports a public base with a path prefix', () => {
        expect(r2KeyFromUrl(`${BASE}/files/k/a.png`, `${BASE}/files`)).toBe('k/a.png');
        expect(r2KeyFromUrl(`${BASE}/other/k/a.png`, `${BASE}/files`)).toBeNull();
    });

    it('never resolves external, look-alike or empty URLs', () => {
        expect(r2KeyFromUrl('https://other.test/a.png', BASE)).toBeNull();
        expect(r2KeyFromUrl(`${BASE}.evil.test/x.png`, BASE)).toBeNull();
        expect(r2KeyFromUrl('http://cdn.examio.test/a.png', BASE)).toBeNull();
        expect(r2KeyFromUrl(null, BASE)).toBeNull();
        expect(r2KeyFromUrl('', BASE)).toBeNull();
        expect(r2KeyFromUrl(`${BASE}/`, BASE)).toBeNull();
    });

    it('rejects path traversal segments', () => {
        expect(r2KeyFromUrl(`${BASE}/a/../b.png`, BASE)).toBeNull();
    });

    it('rejects non-canonical keys: percent-encoding, backslashes, empty or dot segments', () => {
        expect(r2KeyFromUrl(`${BASE}/a/%2e%2e/b.png`, BASE)).toBeNull();
        expect(r2KeyFromUrl(`${BASE}/a/%2E%2E/b.png`, BASE)).toBeNull();
        expect(r2KeyFromUrl(`${BASE}/a/b%2fc.png`, BASE)).toBeNull();
        expect(r2KeyFromUrl(`${BASE}/a\\..\\b.png`, BASE)).toBeNull();
        expect(r2KeyFromUrl(`${BASE}/a//b.png`, BASE)).toBeNull();
        expect(r2KeyFromUrl(`${BASE}/a/./b.png`, BASE)).toBeNull();
        expect(isCanonicalR2Key('a/b_c-1.png')).toBe(true);
        expect(isCanonicalR2Key('a/b c.png')).toBe(false);
        expect(isCanonicalR2Key('a/%2e%2e/b.png')).toBe(false);
        expect(isCanonicalR2Key('a/b\nc.png')).toBe(false);
    });

    it('resolves what a browser would load: encoded or control-char dot segments collapse', () => {
        // %2e%2e and ".\t." are both resolved to ".." by the URL parser
        expect(rawR2Key(`${BASE}/t/u1/%2e%2e/u2/a.png`, BASE)).toBe('t/u2/a.png');
        expect(rawR2Key(`${BASE}/t/u1/.\t./u2/a.png`, BASE)).toBe('t/u2/a.png');
        expect(rawR2Key(`${BASE}/t/u1/.\n./u2/a.png`, BASE)).toBe('t/u2/a.png');
    });

    it('matches our host case-insensitively and with an explicit default port', () => {
        expect(rawR2Key('HTTPS://CDN.EXAMIO.TEST/t/u2/a.png', BASE)).toBe('t/u2/a.png');
        expect(rawR2Key('https://cdn.examio.test:443/t/u2/a.png', BASE)).toBe('t/u2/a.png');
        expect(rawR2Key('https://cdn.examio.test:8443/t/u2/a.png', BASE)).toBeNull();
    });

    it('URLs built from a non-canonical R2_PUBLIC_URL stay deletable once the base is canonicalised', () => {
        for (const raw of ['HTTPS://CDN.EXAMIO.TEST/', 'https://cdn.examio.test:443', 'https://cdn.examio.test/files/']) {
            const base = canonicalR2PublicBase(raw);
            const url = `${base}/avatars/u1/a.png`;
            expect(r2KeyFromUrl(url, raw)).toBe('avatars/u1/a.png');
        }
        expect(canonicalR2PublicBase('HTTPS://CDN.EXAMIO.TEST:443/')).toBe('https://cdn.examio.test');
    });

    it('a percent-encoded slash is never a path separator', () => {
        expect(rawR2Key(`${BASE}/t/u1%2Fx.png`, BASE)).toBe('t/u1%2Fx.png');
        expect(r2KeyFromUrl(`${BASE}/t/u1%2Fx.png`, BASE)).toBeNull();
    });

    it('returns null when no public base is configured (never guess a host)', () => {
        expect(r2KeyFromUrl(`${BASE}/a.png`, '')).toBeNull();
        const prev = process.env.R2_PUBLIC_URL;
        delete process.env.R2_PUBLIC_URL;
        try {
            expect(r2KeyFromUrl(`${BASE}/a.png`)).toBeNull();
            process.env.R2_PUBLIC_URL = BASE;
            expect(r2KeyFromUrl(`${BASE}/a.png`)).toBe('a.png');
        } finally {
            if (prev === undefined) delete process.env.R2_PUBLIC_URL;
            else process.env.R2_PUBLIC_URL = prev;
        }
    });
});
