import {
    isForeignR2Url,
    ownedR2Key,
    ownedR2KeyFromUrl,
    ownerKeyFolder,
} from './r2-owned-key';

const BASE = 'https://cdn.kmaedu.test';

describe('r2-owned-key', () => {
    it('builds the owner-scoped folder for a safe owner id', () => {
        expect(ownerKeyFolder('avatars', 'u1')).toBe('avatars/u1');
        expect(() => ownerKeyFolder('avatars', '../x')).toThrow();
        expect(() => ownerKeyFolder('avatars', '')).toThrow();
    });

    it('ownedR2Key accepts only keys under <area>/<owner>/', () => {
        expect(ownedR2Key('avatars/u1/a.png', ['avatars'], 'u1')).toBe('avatars/u1/a.png');
        expect(ownedR2Key('avatars/u2/a.png', ['avatars'], 'u1')).toBeNull();
        expect(ownedR2Key('avatars/a.png', ['avatars'], 'u1')).toBeNull(); // legacy owner-less
        expect(ownedR2Key('avatars/u1', ['avatars'], 'u1')).toBeNull();
        expect(ownedR2Key('avatars/u1/../u2/a.png', ['avatars'], 'u1')).toBeNull();
        expect(ownedR2Key('avatars/u1/a.png', ['banners'], 'u1')).toBeNull();
        expect(ownedR2Key('avatars/u1/a.png', ['avatars'], 'u')).toBeNull();
        expect(ownedR2Key(null, ['avatars'], 'u1')).toBeNull();
        // encoded traversal out of the caller's own folder (F12)
        expect(ownedR2Key('ai-teacher/u1/%2e%2e/u2/x.png', ['ai-teacher'], 'u1')).toBeNull();
        expect(ownedR2Key('avatars/u1//a.png', ['avatars'], 'u1')).toBeNull();
    });

    it('treats a non-canonical URL on our R2 host as foreign, never as external (F11)', () => {
        const area = ['flashcardset-thumbnails'];
        for (const url of [
            `${BASE}/flashcardset-thumbnails/u1/%2e%2e/u2/a.png`,
            `${BASE}/flashcardset-thumbnails/u1/.\t./u2/a.png`,
            `${BASE}/flashcardset-thumbnails/u1/.\n./u2/a.png`,
            'HTTPS://CDN.KMAEDU.TEST/flashcardset-thumbnails/u2/a.png',
            'https://cdn.kmaedu.test:443/flashcardset-thumbnails/u2/a.png',
        ]) {
            expect(isForeignR2Url(url, area, 'u1', BASE)).toBe(true);
            expect(ownedR2KeyFromUrl(url, area, 'u1', BASE)).toBeNull();
        }
    });

    it('our hostname on another port, scheme or trailing-dot form is foreign, not external (F16)', () => {
        const area = ['flashcardset-thumbnails'];
        for (const url of [
            'https://cdn.kmaedu.test:8443/flashcardset-thumbnails/u2/a.png',
            'http://cdn.kmaedu.test/flashcardset-thumbnails/u2/a.png',
            'https://cdn.kmaedu.test./flashcardset-thumbnails/u2/a.png',
            'https://cdn.kmaedu.test:8443/flashcardset-thumbnails/u1/a.png', // own key, wrong origin: not checkable
        ]) {
            expect(isForeignR2Url(url, area, 'u1', BASE)).toBe(true);
            expect(ownedR2KeyFromUrl(url, area, 'u1', BASE)).toBeNull();
        }
        // a genuinely external host is still allowed for display
        expect(isForeignR2Url('https://images.example.org/a.png', area, 'u1', BASE)).toBe(false);
    });

    it('a control character inside a key is never owned (F12)', () => {
        expect(ownedR2Key('ai-teacher/u1/.\n./x.png', ['ai-teacher'], 'u1')).toBeNull();
    });

    it('ownedR2KeyFromUrl resolves only our own R2 URLs', () => {
        expect(ownedR2KeyFromUrl(`${BASE}/avatars/u1/a.png`, ['avatars'], 'u1', BASE)).toBe(
            'avatars/u1/a.png'
        );
        expect(ownedR2KeyFromUrl(`${BASE}/avatars/u2/a.png`, ['avatars'], 'u1', BASE)).toBeNull();
        expect(ownedR2KeyFromUrl('https://x.test/avatars/u1/a.png', ['avatars'], 'u1', BASE)).toBeNull();
    });

    it('isForeignR2Url flags R2-host URLs outside the caller prefix, not external URLs', () => {
        expect(isForeignR2Url(`${BASE}/avatars/u2/a.png`, ['avatars'], 'u1', BASE)).toBe(true);
        expect(isForeignR2Url(`${BASE}/avatars/old.png`, ['avatars'], 'u1', BASE)).toBe(true);
        expect(isForeignR2Url(`${BASE}/avatars/u1/a.png`, ['avatars'], 'u1', BASE)).toBe(false);
        expect(isForeignR2Url('https://elsewhere.test/a.png', ['avatars'], 'u1', BASE)).toBe(false);
        expect(isForeignR2Url(null, ['avatars'], 'u1', BASE)).toBe(false);
        const saved = process.env.R2_PUBLIC_URL;
        delete process.env.R2_PUBLIC_URL;
        try {
            expect(isForeignR2Url(`${BASE}/avatars/u2/a.png`, ['avatars'], 'u1')).toBe(false);
        } finally {
            if (saved !== undefined) process.env.R2_PUBLIC_URL = saved;
        }
    });
});
