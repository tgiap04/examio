# F001 - Account Authentication & Session Management Screens

## Screen List
- SCR008 `/login` - Login screen with credentials, Google OAuth, and Google One Tap support.
- SCR009 `/register` - Registration form.
- SCR010 `/forgot-password` - Password reset code request.
- SCR011 `/reset-password` - Code and new password submission.
- SCR012 `/k` - Authenticated workspace redirect target; exact destination Needs verification.
- SCR101-SCR105 - Android auth graph, login, register, forgot password, reset password.
- SCR201-SCR205 - iOS auth flow, login, register, forgot password, reset password.

## User Journey
1. Visitor opens login or register.
2. Visitor signs up with email/password or starts Google OAuth. If the signup URL contains a `?from=` parameter, the user is redirected to that path after successful registration (overrides the default `/k` redirect).
3. Backend authenticates the user, creates session credentials, and returns tokens/cookies.
4. Client persists auth state and sends user to `/k` or the `?from=` target if provided.
5. Authenticated user revisits public auth pages and is redirected back to the workspace.
6. If an API call returns expired session (401), the client attempts refresh and retries once.
7. If refresh fails, local auth state is cleared and the user returns to `/login`. Redirect back target is not stored when already on `/login` to prevent redirect loops.
8. On 403 session invalidation (e.g., session killed by admin or from another device), client clears auth state, alerts the user, and redirects to `/login`. Redirect loop prevention applies.
9. For forgotten passwords, the user requests a reset code, submits the code and new password, then returns to the appropriate sign-in/success path. Exact redirect Needs verification.

## Artifact References
- `screen-list.md` SCR008-SCR012, SCR101-SCR105, SCR201-SCR205
- `screen-flow.md` FLW002-FLW006, FLW011-FLW012, FLW101-FLW104, FLW201-FLW204
- Source paths: web auth routes in `kmaedu-fe/src/routes/index.tsx` Needs verification for exact route declarations.
