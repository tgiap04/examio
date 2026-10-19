import { buildCorsOptions } from './cors-options';

describe('buildCorsOptions', () => {
    it('adds the dev origins outside production', () => {
        const opts = buildCorsOptions({ FRONTEND_URL: 'https://app.example' });
        expect(opts.origin).toEqual(
            expect.arrayContaining(['https://app.example', 'http://localhost:5173'])
        );
        expect(opts.credentials).toBe(true);
    });

    it('CORS_ORIGINS wins over FRONTEND_URL and is trimmed', () => {
        const opts = buildCorsOptions({
            NODE_ENV: 'production',
            CORS_ORIGINS: ' https://a.example , https://b.example ',
            FRONTEND_URL: 'https://ignored.example',
        });
        expect(opts.origin).toEqual(['https://a.example', 'https://b.example']);
    });

    it('production has no dev origins and fails fast with an empty allowlist', () => {
        expect(buildCorsOptions({ NODE_ENV: 'production', FRONTEND_URL: 'https://a.example' }).origin).toEqual([
            'https://a.example',
        ]);
        expect(() => buildCorsOptions({ NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);
    });

    it('allows the headers the FE sends', () => {
        expect(buildCorsOptions({}).allowedHeaders).toEqual(
            expect.arrayContaining(['Authorization', 'X-Device-ID'])
        );
    });
});
