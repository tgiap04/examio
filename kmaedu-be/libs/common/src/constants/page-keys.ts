/**
 * Danh sách trang có thể bật/tắt cho user (global, admin điều khiển).
 *
 * Đây là nguồn sự thật DUY NHẤT phía backend cho page-toggle feature:
 * - `admin-service` dùng `isToggleablePageKey` để validate key khi toggle.
 * - `gateway` dùng `@TogglePage(key)` + `PageEnabledGuard` để chặn API.
 *
 * Frontend có bản sao riêng ở `src/lib/page-keys.ts` (không import cross-package).
 */
export const TOGGLEABLE_PAGE_KEYS = [
    'ai-tool',
    'word-family',
    'my-materials',
    'my-exams',
    'manage-exam',
    'flash-card',
    'manage-exam-room',
    'history',
    'study-room',
] as const;

export type PageKey = (typeof TOGGLEABLE_PAGE_KEYS)[number];

/** Kiểm tra một chuỗi bất kỳ có phải page key hợp lệ không. */
export function isToggleablePageKey(value: string): value is PageKey {
    return (TOGGLEABLE_PAGE_KEYS as readonly string[]).includes(value);
}

/**
 * Nhãn hiển thị mặc định cho admin UI — dùng để tự sinh dòng cho key CHƯA có
 * bản ghi PageFeatureFlag trong DB (tránh phải chạy seed thủ công khi thêm
 * page key mới). Xem admin-page-config.service.ts → list()/toggle().
 */
export const PAGE_LABELS: Record<PageKey, string> = {
    'ai-tool': 'Công cụ AI',
    'word-family': 'Từ vựng tiếng Anh',
    'my-materials': 'Tài liệu của tôi',
    'my-exams': 'Bài thi của tôi',
    'manage-exam': 'Quản lý Đề thi',
    'flash-card': 'Quản lý Flashcard',
    'manage-exam-room': 'Quản lý Phòng thi',
    history: 'Lịch sử',
    'study-room': 'Phòng học chung',
};

/**
 * Ánh xạ page key → các base-path proxy controller mà nó khống chế ở gateway.
 *
 * Mảng RỖNG nghĩa là trang chỉ ẩn UI phía FE, KHÔNG chặn API — vì trang đó dùng
 * chung route core (ví dụ my-exams / my-materials / history đọc từ nhiều nguồn
 * dữ liệu dùng chung, chặn API sẽ vỡ các trang khác). Chỉ mang tính tài liệu;
 * việc chặn thực tế do `@TogglePage(key)` trên từng controller quyết định.
 */
export const PAGE_ROUTE_MAP: Record<PageKey, string[]> = {
    'ai-tool': ['ai'],
    'word-family': ['word-family'],
    'my-materials': [],
    'my-exams': [],
    'manage-exam': ['quizsets'],
    'flash-card': ['flashcardsets'],
    'manage-exam-room': ['examrooms'],
    history: [],
    'study-room': ['studyrooms'],
};
