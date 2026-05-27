# F012 - Cross-Platform Mobile Companion Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Token restore fails on launch | User remains or returns to auth flow. iOS restore semantics Need verification. | Please sign in again. |
| OAuth callback deep link missing token | Auth cannot complete and user stays on login. | Sign-in callback was invalid. Please try again. |
| Non-auth deep link received | Destination handling completeness Needs verification. | This link is not supported yet. |
| Mobile feature screen expects API data | Many screens use local mock state instead of repositories. | This mobile feature is not fully connected yet. |
| AI streaming requested on mobile | SSE actual implementations throw `NotImplementedError`. | Live AI streaming is not available on mobile yet. |
| Backend DTO differs from KMP model | Request may fail or data may render incorrectly; parity Needs verification. | We could not load this content. Please update the app or try later. |
| iOS shared token storage used by KMP flow | KMP iOS SecureTokenStorage is stubbed; private Swift Keychain auth is used instead. | Please sign in again. |
| Offline or poor network | API-backed auth/actions fail; mock-backed screens may still navigate locally. | You appear to be offline. Check your connection. |
