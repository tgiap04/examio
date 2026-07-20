// Chấp nhận link YouTube: watch, youtu.be, shorts, playlist, embed.
// Neo cuối (không cho ký tự lạ đuôi) để tránh URL rác lọt qua rồi phát tán.
const TAIL = String.raw`(?:[?&#/][^\s]*)?$`;
const YT_PATTERNS = [
    new RegExp(String.raw`^https?://(www\.)?youtube\.com/watch\?[^\s]*v=[\w-]{11}` + TAIL),
    new RegExp(String.raw`^https?://youtu\.be/[\w-]{11}` + TAIL),
    new RegExp(String.raw`^https?://(www\.)?youtube\.com/shorts/[\w-]{11}` + TAIL),
    new RegExp(String.raw`^https?://(www\.)?youtube\.com/embed/[\w-]{11}` + TAIL),
    new RegExp(String.raw`^https?://(www\.)?youtube\.com/playlist\?[^\s]*list=[\w-]+` + TAIL),
    new RegExp(String.raw`^https?://(www\.)?youtube\.com/watch\?[^\s]*list=[\w-]+` + TAIL),
];

export function isValidYouTubeUrl(url: string): boolean {
    if (typeof url !== 'string' || url.length > 500) return false;
    return YT_PATTERNS.some((re) => re.test(url.trim()));
}

export function sanitizeChat(content: unknown): string | null {
    if (typeof content !== 'string') return null;
    const trimmed = content.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, 500);
}
