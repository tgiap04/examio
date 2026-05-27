# F001 - Account Authentication & Session Management Business Context

This feature is the front door to Examio. It lets people create an account, sign in, stay signed in, recover access when they forget a password, and leave safely when they log out.

Users can start with email and password or choose Google sign-in. After they sign in, Examio keeps their session active so they can move through the workspace without repeatedly logging in. If their session expires, the app tries to renew it quietly before interrupting them.

The same account entry flows exist across web, Android, and iOS. Web is fully wired for the main auth flow. Android uses the shared mobile auth layer. iOS auth works through its own Swift client and Keychain storage because shared iOS token storage still needs verification.

Password recovery protects users who lose access to their accounts. The product sends a reset code, accepts the code with a new password, and returns the user to sign-in or another success path. The exact post-reset destination is not confirmed in the artifacts.

Successful registration also starts account setup behind the scenes, including wallet creation through backend finance integration.

## Artifact References
- `feature-list.md` F001
- `user-stories.md` US001-US003
- `screen-flow.md` FLW002-FLW006
- `permissions.md` PERM002-PERM008
