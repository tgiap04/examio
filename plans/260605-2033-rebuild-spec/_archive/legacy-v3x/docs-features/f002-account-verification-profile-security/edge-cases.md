# F002 - Account Verification & Profile Security Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Verification code is invalid or expired | Verify API rejects code; account remains unverified | Verification code is invalid or expired. |
| User requests verification too often | API may rate limit or reject repeated sends; exact behavior Needs verification | Please wait before requesting another code. |
| Profile update validation fails | Profile API rejects invalid fields | Please check your profile details. |
| Avatar/banner upload fails | R2/media API fails; existing profile media remains unchanged | Upload failed. Please try again. |
| Device logout targets current session | Session may end and client should return to login; exact UX Needs verification | You have been signed out. |
| Device list cannot load | UI should show recoverable error and keep profile usable | Could not load active devices. |
| Session expires while editing profile | Auth refresh runs; on failure user returns to login | Your session expired. Please sign in again. |
| Mobile profile screen action is not wired | Platform UI may show local/mock state only | This feature is not available yet. Needs verification. |

## Artifact References
- `behavior-logic.md` BL009, BL057, BL070-BL072
- `permissions.md` PERM009-PERM011, PERM038, PERM040
- `api-map.md` API002, API012
