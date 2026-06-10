# Edge Cases — F011_FlashcardStudy

| Scenario | What Happens | User-Facing Message |
|----------|--------------|---------------------|
| Empty flashcard set (0 cards) | System detects flashcards.length === 0 and renders empty state | "Bộ flashcard này chưa có thẻ nào" |
| Access code wrong | API call throws; error message shown in modal | "Có lỗi xảy ra, vui lòng thử lại" |
| Access code too short (<6 chars) | Inline validation prevents submission | "Vui lòng nhập mã truy cập" |
| User not authenticated | Auth store redirects to /login with returnTo param | (redirect — no message) |
| Network error during flashcard load | Error toast shown, stays on loading state | "Đang tải bộ flashcard..." stays |
| Network error during progress save | Fire-and-forget silently fails; progress bar shows optimistic count | None — silent handling |
| First card (index 0) | Previous button disabled | Button grayed out, no action |
| Last card | Next button disabled | Button grayed out, no action |
| Deck has >20 cards | Dot indicators replaced with text counter (e.g., "3 / 50") | "3 / 50" |
| User denied access (not owner, not whitelisted, no code) | Access denied screen shown with deck info | "Bộ flashcard này là riêng tư hoặc bạn chưa được thêm vào whitelist." |
