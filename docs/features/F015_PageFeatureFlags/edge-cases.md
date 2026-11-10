# Edge Cases — F015_PageFeatureFlags

| Scenario | What Happens | User-Facing Message |
|----------|--------------|---------------------|
| Admin toggles a page to disabled | DB updated, Redis cache rebuilt, SSE broadcast fires, audit row written | Switch shows disabled state |
| Admin toggles an invalid/unknown key | `BadRequestException` — key not in `TOGGLEABLE_PAGE_KEYS` | Generic save error, switch reverts |
| Admin toggles a key with no matching DB row | `NotFoundException` | Generic save error, switch reverts |
| Redis is down during a toggle's cache rebuild step | Toggle still succeeds (DB is source of truth); cache rebuild logs a warning | None — toggle appears successful |
| Redis pub/sub publish fails after a successful toggle | Toggle succeeds; other clients won't get realtime push until their next full fetch | None — other users see stale state until next reload |
| Audit log write fails after a successful toggle | Toggle succeeds; failure is only logged as a warning, never surfaced | None |
| A page's flag is missing from the flag map entirely | Treated as enabled (default-on) | Page renders normally |
| Any infra error occurs while a user's client checks page state | Fails open — page is shown as if enabled | None |
| A disabled page's route is visited directly via URL | Gateway returns 404 (not 403); frontend renders client-side `<NotFound/>` | Standard "not found" page |
| A user is actively viewing a page that gets disabled mid-session | SSE push updates the store; `FeatureRoute` reactively swaps to 404 | Toast: "Trang này vừa bị quản trị viên tắt." |
| SSE connection drops | Client reconnects with exponential backoff (1s → 30s cap) | None — transparent to user until reconnect |
| A FE-only toggle key (`my-materials`, `my-exams`, `history`) is disabled | Hidden in UI only; underlying API routes remain reachable (shared with other enabled features) | Page hidden from nav/direct visit; API still works if called directly |
