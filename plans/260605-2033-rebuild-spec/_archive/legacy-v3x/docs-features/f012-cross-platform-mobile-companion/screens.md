# F012 - Cross-Platform Mobile Companion Screens

## Screen List
- SCR101-SCR105 Android auth screens - API-backed auth.
- SCR108-SCR109 Android AI chat/tool screens - shared API ready, platform UI mock-backed; SSE stubbed.
- SCR110-SCR111 Android quiz/exam screens - shared API ready, platform UI mock-backed.
- SCR112 Android flashcards/study - shared API ready, platform UI mock-backed.
- SCR113 Android history - shared API ready, platform UI mock-backed.
- SCR114-SCR115 Android account/wallet - shared API ready, mostly mock-backed except auth/logout.
- SCR116 Android teacher management - not wired/mock-backed.
- SCR201-SCR205 iOS auth flow/login/register/forgot/reset - API-backed.
- SCR206 iOS main tab shell - mixed backing after auth.
- SCR207-SCR213 iOS home, AI, study, exams, account, teacher, placeholder - mostly mock-backed.

## User Journey
1. User launches the mobile app.
2. If unauthenticated, user signs in, registers, resets password, or completes OAuth.
3. Token persistence moves the user into the main tab shell.
4. User navigates between home, AI, study, exams, history, account/wallet, and teacher tabs.
5. Auth-backed functions call real APIs; most feature screens currently update local UI state.
6. Deep links route auth callbacks and may route other destinations once verified.

## Artifact References
- `screen-list.md` Android Mobile Screens and iOS Mobile Screens sections.
- `screen-flow.md` FLW201-FLW206 and Android Flow section.
- `feature-list.md` F012.
