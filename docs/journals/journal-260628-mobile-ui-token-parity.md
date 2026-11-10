# Session Journal — Mobile UI Token Parity (Android + iOS)

**Date**: 2026-06-28  
**Severity**: Medium  
**Component**: Mobile UI (examio-app Android + iOS)  
**Status**: Resolved  

## What

User reported Android cards "missing borders" (mat border) and colors not matching web FE. Brought both mobile apps to pixel parity with `examio-fe/src/app/globals.css` light tokens. Android COMPILE_SUCCESS, iOS BUILD_SUCCEEDED.

## The border-bug insight (kept)

The real find was not a color tweak — it was **why cards vanished**. Three factors compounded:

1. Material3's `ColorScheme` in `ExamioTheme.kt` defined NO `outline`/`outlineVariant` token. Every screen used `Card(containerColor = surface)` with zero elevation, zero border.
2. FE card surface is `--surface #E8E5E0` vs canvas `--canvas #FAF9F7` — delta of only ~11 in luminance. The human eye cannot resolve that boundary without a stroke.
3. FE always draws `1px solid var(--hairline #D8D4CC)` on every card.

**Fix**: add `outline = Color(0xFFD8D4CC)` to the Material ColorScheme + a new `ExamioCard` composable that wraps `Card(surface)` + 1px hairline border + 12dp radius + 0 elevation. One source of truth. No per-screen border hacks.

## Root cause chain

- Android `ExamioTheme.kt` drifted over time: primary was old orange `#CC785C` instead of FE coral `#C2522D`. Canvas `#F9F4EE` vs FE `#FAF9F7`. Ink `#2C2C2C` vs FE `#1A1A1A`.
- iOS had NO shared theme file — `Color(red:g:b:)` scattered across 50+ view files, each approximation slightly different, none matching FE.
- Material3 default `Card` with `containerColor = surface` and no border means the card boundary is pure luminance contrast — and the palette was so flat that boundary collapsed.

## What was built

**Android** (`androidApp/`):
- Rewrote `design/ExamioTheme.kt` — 16 tokens verified hex-by-hex against `globals.css` `:root` light block. Added `outline`, `outlineVariant`, `surfaceVariant`. Non-Material semantics via `ExamioTokens` accessor (hairline, success, warning). `examioCardBorder()` extension.
- New `design/ExamioCard.kt` — single composable: `Card` + `Surface(hairline)` border + 12dp rounded + 0 elevation. Single source for every FE card look.
- ~16 screens (`features/**`, `navigation/**`) swapped `Card` -> `ExamioCard`, all hardcoded `Color(0x..)` -> `colorScheme.*` / `tokens.*`. `DeThiScreen.kt` was worst offender (6 inline hexes).
- Google brand blue `#4285F4` intentionally kept (not part of examio palette, Google sign-in).

**iOS** (`iosApp/`):
- New `Design/ExamioTheme.swift` — `Color(hex:)` init, 16 static token properties, `.examioCard()` view modifier.
- Recolored: `Auth/` views + `Views/` (HomeView, AccountView, SettingsView, etc.). Stripped hardcoded `Color(red:g:b:)` calls.
- Fixed pre-existing build break: 8 view-model `.swift` files missing from `project.pbxproj` (compiler silently ignored them; added to project now links properly).

## Decisions

- **Scope**: token layer + full Android recolor + iOS recolor. Light mode only. FE has dark mode; deferred with `TODO(dark-mode)` documented in both `ExamioTheme.kt` and `ExamioTheme.swift`.
- **iOS PlaceholderScreens**: NOT converted to full UI this round. Separate parity plan needed.
- **`outline` token value**: FE `--hairline #D8D4CC` reused for Material `outline`. `outlineVariant` set to `#E5E1DA` (one step lighter). These match what FE uses for card borders vs divider lines.

## Review outcome

`reviewer` pass returned **DONE_WITH_CONCERNS** — all 16 tokens pixel-perfect confirmed, no logic/API regressions found. Its High items fixed:
- 3 iOS surfaces missing hairline — HomeView recent rows, AccountView wallet balance card — added `.overlay(RoundedRectangle(...).stroke(Color.examioHairline, lineWidth: 1))`.
- `Color.red` references -> `Color.examioError` (FE `--error #D32F2F`).
- Documented light-only dark-mode behavior inline.

## Verification

- Android: `./gradlew :androidApp:compileDebugKotlin` — BUILD SUCCESSFUL, 0 errors.
- iOS: `xcodebuild -scheme ExamioApp -project iosApp/ExamioApp.xcodeproj` — BUILD SUCCEEDED (iPhone 17 simulator target).
- Hex grep guard: `grep -r 'Color(0x' androidApp/src/main/java/com/examio/app/features/` returns 0 hits. All hex values live in `design/` exclusively. iOS: 2 intentional Google-blue `Color(hex: "#4285F4")` remain; zero other hardcoded hexes.

**NOT screenshot-verified** — no emulator was available. Install + eyeball required.

## Lessons

- Material3 `Card` with no `outline` token is invisible on flat palettes. If you do not define `outline`, the spec silently drops it and you get zero border — not a default border.
- A shared token file prevents drift. The old Android theme was "close" to FE but never exactly matched because nobody ran the hex diff. Next time: automate a hex comparison script between `globals.css` and the theme file on CI.
- iOS scattering `Color(red:g:b:)` across 50 files means 50 points of divergence. One `ExamioTheme.swift` file fixes it in one commit.
- `project.pbxproj` staleness can silently exclude .swift files from compilation. `xcodebuild` ran fine because those files were never included.
