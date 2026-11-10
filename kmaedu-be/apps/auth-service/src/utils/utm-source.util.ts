/**
 * Chuẩn hoá giá trị utm_source trước khi lưu vào User.
 * Whitelist charset [a-z0-9_.-], cap 64 ký tự (khớp @db.VarChar(64)).
 * Trả null cho giá trị rỗng/không hợp lệ → gộp nhóm "direct" khi tổng hợp.
 */
export function sanitizeUtmSource(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 64) return null;
    // "direct" là nhãn dành riêng cho lượt không có nguồn (COALESCE ở tổng hợp)
    // — chặn để không ai bơm ?utm_source=direct giả làm organic.
    if (trimmed.toLowerCase() === 'direct') return null;
    return /^[\w.-]+$/.test(trimmed) ? trimmed : null;
}

/**
 * Rút utm_source từ chuỗi OAuth `state` (base64url JSON) mà Google trả về.
 * State do FE tạo dạng { redirect?, utmSource? } rồi guard nhét thêm nonce.
 * An toàn với input rác — mọi lỗi decode/parse → null.
 */
export function extractUtmSourceFromState(state: unknown): string | null {
    if (typeof state !== 'string' || !state) return null;
    try {
        const parsed = JSON.parse(
            Buffer.from(state, 'base64url').toString('utf8')
        );
        return sanitizeUtmSource(parsed?.utmSource);
    } catch {
        return null;
    }
}
