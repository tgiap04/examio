import { isValidYouTubeUrl, sanitizeChat } from './study-room.util';

describe('isValidYouTubeUrl', () => {
    it.each([
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://www.youtube.com/shorts/dQw4w9WgXcQ',
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
        'https://www.youtube.com/playlist?list=PL1234567890',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL12345',
    ])('chấp nhận link hợp lệ: %s', (url) => {
        expect(isValidYouTubeUrl(url)).toBe(true);
    });

    it.each([
        'https://vimeo.com/12345',
        'http://evil.com/watch?v=dQw4w9WgXcQ',
        'javascript:alert(1)',
        '<script>alert(1)</script>',
        'https://www.youtube.com/',
        '',
    ])('từ chối link không hợp lệ: %s', (url) => {
        expect(isValidYouTubeUrl(url)).toBe(false);
    });

    it('từ chối URL quá dài', () => {
        expect(
            isValidYouTubeUrl('https://youtu.be/' + 'a'.repeat(600))
        ).toBe(false);
    });
});

describe('sanitizeChat', () => {
    it('trim và giữ nội dung', () => {
        expect(sanitizeChat('  hello  ')).toBe('hello');
    });
    it('cắt tối đa 500 ký tự', () => {
        expect(sanitizeChat('a'.repeat(600))?.length).toBe(500);
    });
    it('trả null khi rỗng hoặc không phải string', () => {
        expect(sanitizeChat('   ')).toBeNull();
        expect(sanitizeChat(123 as unknown)).toBeNull();
        expect(sanitizeChat(null as unknown)).toBeNull();
    });
});
