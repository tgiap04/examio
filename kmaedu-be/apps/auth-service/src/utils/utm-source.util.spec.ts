import {
    sanitizeUtmSource,
    extractUtmSourceFromState,
} from './utm-source.util';

describe('sanitizeUtmSource', () => {
    it('giữ giá trị whitelist hợp lệ', () => {
        expect(sanitizeUtmSource('unikorn')).toBe('unikorn');
        expect(sanitizeUtmSource('fb.ads-2026')).toBe('fb.ads-2026');
    });

    it('trim khoảng trắng', () => {
        expect(sanitizeUtmSource('  unikorn  ')).toBe('unikorn');
    });

    it('loại giá trị rỗng / không phải chuỗi → null', () => {
        expect(sanitizeUtmSource('')).toBeNull();
        expect(sanitizeUtmSource('   ')).toBeNull();
        expect(sanitizeUtmSource(undefined)).toBeNull();
        expect(sanitizeUtmSource(null)).toBeNull();
        expect(sanitizeUtmSource(123)).toBeNull();
    });

    it('loại ký tự ngoài whitelist (chống injection/rác)', () => {
        expect(sanitizeUtmSource('drop table')).toBeNull();
        expect(sanitizeUtmSource("a';--")).toBeNull();
        expect(sanitizeUtmSource('<script>')).toBeNull();
    });

    it('loại giá trị dài hơn 64 ký tự', () => {
        expect(sanitizeUtmSource('a'.repeat(65))).toBeNull();
        expect(sanitizeUtmSource('a'.repeat(64))).toBe('a'.repeat(64));
    });

    it('chặn nhãn dành riêng "direct" (chống giả organic)', () => {
        expect(sanitizeUtmSource('direct')).toBeNull();
        expect(sanitizeUtmSource('DIRECT')).toBeNull();
        expect(sanitizeUtmSource(' Direct ')).toBeNull();
    });
});

describe('extractUtmSourceFromState', () => {
    const encode = (obj: unknown) =>
        Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');

    it('rút utmSource từ state base64url hợp lệ', () => {
        expect(
            extractUtmSourceFromState(encode({ utmSource: 'unikorn', nonce: 'x' }))
        ).toBe('unikorn');
    });

    it('sanitize luôn giá trị lấy từ state', () => {
        expect(
            extractUtmSourceFromState(encode({ utmSource: '<bad>' }))
        ).toBeNull();
    });

    it('input rác / thiếu / không phải chuỗi → null', () => {
        expect(extractUtmSourceFromState(undefined)).toBeNull();
        expect(extractUtmSourceFromState('')).toBeNull();
        expect(extractUtmSourceFromState('!!!not-base64!!!')).toBeNull();
        expect(extractUtmSourceFromState(encode({ redirect: '/k' }))).toBeNull();
    });
});
