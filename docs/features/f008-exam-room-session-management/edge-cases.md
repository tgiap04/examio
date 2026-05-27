# F008 Edge Cases - Exam Room & Session Management

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Non-authenticated user opens management page | ProtectedRoute redirects to login. | Please sign in to manage exam rooms. |
| Authenticated non-teacher opens teacher route | Current web route may allow auth-only access; backend should enforce ownership/role. | You do not have permission to manage exam rooms. |
| User edits a room they do not own | Backend rejects mutation. | You can only edit your own exam rooms. |
| Session schedule is invalid | Save/start should be blocked. | Check the session start and end time. |
| Access code/whitelist is missing for restricted session | Session should not be publishable until access rule is valid. | Complete the access settings before sharing. |
| Retake rule conflicts with existing attempts | Backend should preserve existing attempt integrity; exact behavior Needs verification. | Retake settings could not be changed for this session. |
| Analytics has no attempts | Show empty analytics state. | No attempts have been submitted yet. |
| Cheating log route mismatch | Analytics may fail until singular/plural API path is verified. | Integrity logs could not be loaded. |
