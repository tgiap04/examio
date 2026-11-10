# F001 - Account Authentication & Session Management Edge Cases

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| Login credentials are invalid | Auth API rejects login; client keeps user on login screen | Invalid email or password. |
| Register email already exists | Register API rejects duplicate account | This email is already registered. |
| Session expires during workspace use | Axios tries refresh once, then retries original request | Session refreshed. |
| Refresh token/session is invalid | Client clears auth state and redirects to `/login` | Your session expired. Please sign in again. |
| OAuth callback lacks valid tokens | Client cannot persist auth and keeps/returns user to login | Google sign-in failed. Please try again. |
| Password reset code is invalid or expired | Reset password API rejects submission | The reset code is invalid or expired. |
| Network fails during auth request | Request fails without session change | Could not connect. Please try again. |
| Authenticated user opens `/login` or `/register` | PublicRoute redirects to `/k` | Not shown; automatic redirect. |

## Artifact References
- `behavior-logic.md` BL001-BL007
- `permissions.md` PERM002-PERM008
- Source paths: `kmaedu-fe/src/apis/api.ts`, `kmaedu-fe/src/stores/useAuthStore.ts`
