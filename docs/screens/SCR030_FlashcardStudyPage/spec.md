# SCR030: FlashcardStudyPage — Screen Spec

**Screen**: SCR030: FlashcardStudyPage
**Type**: atomic
**Route**: `/study-flashcard/:id`
**Generated**: 2026-06-06

## Purpose

A student studies a flashcard deck: flips cards to reveal answers, navigates forward/backward, shuffles the deck, toggles sound effects, and tracks study progress. The page gates access via Turnstile bot protection and optional 6-digit access code. Students land here from a deck link or from SCR016 (MyMaterialsPage).

## Screen Layout

The page renders as a full-screen fixed layout (`fixed inset-0 flex flex-col overflow-hidden bg-canvas`) with three regions: a header (fixed at top, `z-10 flex-shrink-0`) containing the deck title, creator info, and action buttons; a main card area (flex-1, centered) showing the flip card; and a footer (fixed at bottom, `z-10 flex-shrink-0`) with prev/next navigation and card dot indicators. A 2px coral progress bar runs just below the header. The access code modal, "no access" screen, and loading states each render as full-screen centered overlays that replace the study UI entirely. The card uses CSS 3D transform `rotateY` with `perspective: 1200px` for the flip effect.

### Layout Sketch

```
┌─────────────────────────────────────────────────────┐
│ (conditional) TurnstileGuard — fullscreen loading   │
│ (conditional) AccessCodeModal — fullscreen overlay  │
│ (conditional) NoAccessScreen — fullscreen centered  │
│ (conditional) LoadingFlashcards — fullscreen spinner│
│ (conditional) EmptyState — fullscreen centered     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ R1: Header (fixed-top, z-10, flex-shrink-0)          │
│  [Home btn] [Deck title + description] [actions]   │
│ R2: 2px Coral Progress Bar (below header)           │
├─────────────────────────────────────────────────────┤
│ R3: Main Card Area (flex-1, centered, scrollable)   │
│  [card counter] [FlipCard with front/back]          │
├─────────────────────────────────────────────────────┤
│ R4: Footer Nav (fixed-bottom, z-10, flex-shrink-0)  │
│  [← Trước]  [card dot indicators]  [Sau →]        │
└─────────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | Study Header | fixed-top, z-10 | no | Home button, title/description, view count, shuffle, sound toggle | always visible |
| R2 | Progress Bar | static below R1 | no | 2px coral `div` with width = progress% | full-width |
| R3 | Card Area | flex-1 | yes (overflow) | flip card (CSS 3D), card counter, studied count | `max-w-xl`, centered |
| R4 | Footer Nav | fixed-bottom, z-10 | no | prev/next buttons, card dot grid or page counter | always visible |
| R5 | Access Code Modal | fixed overlay | no | Dialog + Label + Input + footer buttons | centered, `sm:max-w-md` |
| R6 | No Access Screen | fixed overlay | no | Lock icon + title + public info card + Home button | centered |
| R7 | Turnstile/Loading | fixed overlay | no | TurnstileGuard + spinner | full-screen |

## User Flow

### Happy Path

1. Student navigates to `/study-flashcard/{id}`.
2. `TurnstileGuard` renders; once token received, `checkAccess` effect runs (`FlashcardStudyPage.tsx:145`).
3. `isAuthenticated` check; if not, redirect to `/login?from=...` with `setRedirectBackTarget`.
4. `checkFlashcardSetAccess(id)` determines access level:
   - `hasAccess === true` → `loadFlashcards(id)` → cards load with progress → study UI renders.
   - `requiresCode === true` → `showAccessModal = true` → access code dialog shown.
   - `!hasAccess && !requiresCode` → "no access" screen shown with public info.
5. Student reads the front of the card (question), presses Space/Enter/clicks card → `handleFlip` → card rotates 180° via CSS `rotateY`, sound plays if enabled.
6. Student presses ArrowRight or clicks **Sau** → `handleNext` → card index increments, card flips back, `addStudiedCardApi(id, cardId)` called silently.
7. Student presses ArrowLeft or clicks **Trước** → `handlePrevious` → card index decrements, card flips back, sound plays.
8. Student clicks shuffle icon → `handleShuffle` → `flashcards` array shuffled in place, index reset to 0, flipped reset.
9. Student clicks sound toggle → `settings.soundEffects` toggled → icon changes between Volume2/VolumeX.
10. Card dot indicators (shown when ≤20 cards) allow direct navigation to any card.
11. Progress bar updates as `studiedCards.size / totalCards * 100%`.

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| No Turnstile token | `!turnstileToken` | TurnstileGuard shown + "Đang xác minh bảo mật..." | `FlashcardStudyPage.tsx:236` |
| Not authenticated | `!isAuthenticated` | Redirect to login with return URL | `FlashcardStudyPage.tsx:138` |
| No access, requires code | `hasAccess=false && requiresCode=true` | AccessCodeModal shown with public info | `FlashcardStudyPage.tsx:280` |
| No access, no code | `hasAccess=false && requiresCode=false` | "Không có quyền truy cập" full-screen | `FlashcardStudyPage.tsx:251` |
| Access code wrong | API throws | `accessError` shown inline below input | `FlashcardStudyPage.tsx:196` |
| Access code empty | `!accessCode.trim()` | `accessError = "Vui lòng nhập mã truy cập"` | `FlashcardStudyPage.tsx:188` |
| Loading flashcards | `isLoadingFlashcards === true` | Full-screen spinner + "Đang tải bộ flashcard..." | `FlashcardStudyPage.tsx:328` |
| Empty deck | `flashcards.length === 0` | "Không có thẻ" empty state | `FlashcardStudyPage.tsx:340` |
| First card | `currentCardIndex === 0` | Previous button disabled | `FlashcardStudyPage.tsx:509` |
| Last card | `currentCardIndex === totalCards-1` | Next button disabled | `FlashcardStudyPage.tsx:552` |
| >20 cards in deck | `totalCards > 20` | Dot indicators replaced by "N / total" text | `FlashcardStudyPage.tsx:539` |
| Card already studied | `studiedCards.has(card.id)` | Card dot rendered with coral/40 color | `FlashcardStudyPage.tsx:532` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| `flashcardSetTitle` | Deck title | `getFlashcardSetForStudy` → `title` | raw string, `truncate` | n/a | MODEL-012.title |
| `flashcardSetDescription` | Description | `getFlashcardSetForStudy` → `description` | raw string | hidden when null | MODEL-012.description |
| `viewCount` | View count | `getFlashcardSetForStudy` → `viewCount` | integer with thousand separator | n/a | MODEL-012.viewCount |
| `creator.name` | Creator name | `getFlashcardSetForStudy` → `creator.name` | raw string | falls back to `creator.username` | MODEL-001.name |
| `creator.avatar` | Creator avatar | `getFlashcardSetForStudy` → `creator.avatar` | URL | shows default avatar | MODEL-001.avatar |
| `currentCard.question` | Câu hỏi (front) | `flashcards[currentCardIndex].question` | markdown via `dangerouslySetInnerHTML` | n/a | MODEL-014.question |
| `currentCard.answer` | Câu trả lời (back) | `flashcards[currentCardIndex].answer` | markdown via `dangerouslySetInnerHTML` | n/a | MODEL-014.answer |
| `currentCardIndex + 1` | Card counter | computed | "N / total" | n/a | N/A |
| `studiedCards.size` | Studied count | `studiedCards` Set size | integer + "đã học" | `0 đã học` | MODEL-023.studiedCardIds |
| `progress` | Progress % | `studiedCards.size / totalCards * 100` | `X%` | `0%` | MODEL-023.studiedCardIds |
| `settings.soundEffects` | Sound state | local state | boolean toggle | `false` | N/A |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| Turnstile verifying | `!turnstileToken` | Turnstile widget + "Đang xác minh bảo mật..." | none | `FlashcardStudyPage.tsx:236` |
| access checking | `isCheckingAccess === true` | Spinner + "Đang kiểm tra quyền truy cập..." | none | `FlashcardStudyPage.tsx:236` |
| no access | `!hasAccess && !requiresCode` | Full-screen "Không có quyền truy cập" card + Lock icon | Home button | `FlashcardStudyPage.tsx:251` |
| access code required | `showAccessModal === true` | Full-screen Dialog with InputOTP | enter code + verify | `FlashcardStudyPage.tsx:280` |
| verifying code | `isVerifying === true` | Confirm button shows "Đang xác nhận..." | none | `FlashcardStudyPage.tsx:317` |
| code error | `accessError !== ""` | Red text below input | re-enter code | `FlashcardStudyPage.tsx:196` |
| loading flashcards | `isLoadingFlashcards === true` | Spinner + "Đang tải bộ flashcard..." | none | `FlashcardStudyPage.tsx:328` |
| empty deck | `flashcards.length === 0` | "Không có thẻ" empty state + X icon | none | `FlashcardStudyPage.tsx:340` |
| card flipped | `isFlipped === true` | Card rotated 180° via CSS 3D transform | click to flip back | `FlashcardStudyPage.tsx:202` |
| first card | `currentCardIndex === 0` | Previous button disabled | none | `FlashcardStudyPage.tsx:509` |
| last card | `currentCardIndex === totalCards - 1` | Next button disabled | none | `FlashcardStudyPage.tsx:552` |
| card studied | `studiedCards.has(card.id)` | Card dot coral/40 color (vs gray for unstudied) | none | `FlashcardStudyPage.tsx:532` |
| sound enabled | `settings.soundEffects === true` | Volume2 icon + coral border on toggle button | click to toggle off | `FlashcardStudyPage.tsx:410` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| access code | text input | yes | non-empty after trim; max 6 chars | none | "Vui lòng nhập mã truy cập" |
| access code (submitted) | text input | yes | exact match | `loadFlashcards(id, code)` → throws on mismatch | `error?.message` or "Có lỗi xảy ra, vui lòng thử lại" |

### B) Server-side

#### Check flashcard set access
- **Endpoint:** `GET /api/v1/flashcardsets/{id}/access-check`
- **Request:** `{ id }` from URL param
- **Success:** `200` → `{ hasAccess, requiresCode, accessType }`
- **Errors:** `4xx` → `catch` block → public info fetched, `accessCheckResult` may show no-access
- **Trigger:** `checkAccess` effect on mount
- **Source:** `FlashcardStudyPage.tsx:148`

#### Get public info
- **Endpoint:** `GET /api/v1/flashcardsets/{id}/public`
- **Request:** `{ id }` from URL param
- **Success:** `200` → `{ title, creator }` — used in access modal and no-access screen
- **Errors:** silently caught (set doesn't exist)
- **Trigger:** when `requiresCode === true` or no access without code
- **Source:** `FlashcardStudyPage.tsx:153`

#### Load flashcards for study
- **Endpoint:** `GET /api/v1/flashcardsets/{id}/study?code={code}&turnstileToken={token}`
- **Request:** `{ id, code?, turnstileToken }`
- **Success:** `200` → `{ flashCards[], title, description, viewCount, creator }`
- **Errors:** `4xx/5xx` → thrown, caught and shown as `accessError`
- **Trigger:** `loadFlashcards` function (called on access granted or code verification)
- **Source:** `FlashcardStudyPage.tsx:95`

#### Get study progress
- **Endpoint:** `GET /api/v1/flashcard-progress/{flashcardSetId}`
- **Request:** `{ flashcardSetId }` from URL param
- **Success:** `200` → `{ studiedCardIds: string[] }` — set into `studiedCards` Set
- **Errors:** silently caught (progress not critical)
- **Trigger:** after `loadFlashcards` succeeds
- **Source:** `FlashcardStudyPage.tsx:108`

#### Add studied card
- **Endpoint:** `POST /api/v1/flashcard-progress/{flashcardSetId}/cards`
- **Request:** `{ cardId: string }`
- **Success:** `200` → silently saved; optimistic update already applied in UI
- **Errors:** silently caught
- **Trigger:** `handleNext` when card not yet in `studiedCards`
- **Source:** `FlashcardStudyPage.tsx:223`

## Interaction Patterns

- **Pressing Space or Enter flips the card** — `e.preventDefault()` then `handleFlip()`, source: `FlashcardStudyPage.tsx:177`
- **Pressing ArrowLeft goes to previous card** — `handlePrevious()`, source: `FlashcardStudyPage.tsx:175`
- **Pressing ArrowRight goes to next card** — `handleNext()`, source: `FlashcardStudyPage.tsx:175`
- **Clicking the flip card area flips it** — `onClick={handleFlip}` on the card wrapper, source: `FlashcardStudyPage.tsx:450`
- **Sound effects play on flip/navigate** — `playSound('flip'|'next'|'prev')` using `HTMLAudioElement`, source: `FlashcardStudyPage.tsx:85`
- **Shuffling resets index to 0 and un-flips** — array in-place sort + `setCurrentCardIndex(0)` + `setIsFlipped(false)`, source: `FlashcardStudyPage.tsx:228`
- **Going to next card saves study progress** — `addStudiedCardApi(id, cardId)` fires silently after the state update, source: `FlashcardStudyPage.tsx:223`
- **Clicking a card dot navigates directly** — `setCurrentCardIndex(index)` + `setIsFlipped(false)`, source: `FlashcardStudyPage.tsx:525`
- **Sound toggle persists only in session** — `settings` state, not persisted to storage

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | present | `aria-label="Về trang chủ"` on Home button; `aria-label` on shuffle, sound, nav buttons; `aria-label` on card dot buttons |
| Keyboard navigation | supported | ArrowLeft/Right for prev/next; Space/Enter for flip; Tab through all buttons |
| Focus management | unmanaged | No explicit focus trap; `perspective` container sets 3D context |
| Screen reader compatibility | unknown | `dangerouslySetInnerHTML` may not be fully accessible; card flip is visual-only |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `!turnstileToken` | security | TurnstileGuard + verifying spinner | study UI | `FlashcardStudyPage.tsx:236` |
| `isCheckingAccess === true` | async | Spinner + "Đang kiểm tra..." | study UI | `FlashcardStudyPage.tsx:236` |
| `!hasAccess && !requiresCode` | auth | "Không có quyền truy cập" screen | study UI + modal | `FlashcardStudyPage.tsx:251` |
| `showAccessModal === true` | auth | AccessCodeDialog | study UI + no-access screen | `FlashcardStudyPage.tsx:280` |
| `isLoadingFlashcards === true` | async | Spinner + "Đang tải bộ flashcard..." | study UI | `FlashcardStudyPage.tsx:328` |
| `flashcards.length === 0` | data | "Không có thẻ" empty state | study UI | `FlashcardStudyPage.tsx:340` |
| `currentCardIndex === 0` | data | Previous button disabled | enabled | `FlashcardStudyPage.tsx:509` |
| `currentCardIndex === totalCards-1` | data | Next button disabled | enabled | `FlashcardStudyPage.tsx:552` |
| `totalCards > 20` | data | Page counter instead of dots | dot grid | `FlashcardStudyPage.tsx:539` |
| `settings.soundEffects === true` | interaction | Volume2 icon + coral button style | VolumeX style | `FlashcardStudyPage.tsx:410` |
| `publicInfo !== null` | data | Public info card in access modal and no-access screen | hidden | `FlashcardStudyPage.tsx:262` |
| `flashcardSetDescription` | data | Subtitle in header | hidden when null | `FlashcardStudyPage.tsx:378` |

## Component Variants

| Component | Discriminating field | Variants on this screen | Screen-specific props/slots | Cross-ref |
|-----------|---------------------|------------------------|----------------------------|-----------|
| FlipCard | `isFlipped` state | front (cream surface) / back (warm coral accent) | `onClick`, `dangerouslySetInnerHTML` on front/back | MODEL-014 |
| Card dot | `isStudied && !isCurrent` | coral/40 dot | `background: bg-coral/40` | N/A |
| Card dot | `!isStudied && !isCurrent` | gray dot | `bg-hairline` | N/A |
| Card dot | `isCurrent` | coral enlarged dot | `h-2.5 w-2.5 bg-coral` | N/A |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| Turnstile token required | bot-protection | `isCheckingAccess` loops until token received |
| `isAuthenticated` check | auth | Redirect to `/login?from=...` with return URL |
| Access code check | auth | Wrong code → inline error; no access → full-screen denied card |
| `hasAccess` gate | auth | Users not in whitelist cannot load flashcards; see no-access or code gate |

## Source References

- Page/View: `examio-fe/src/pages/study-flashcard/FlashcardStudyPage.tsx:50`
- TurnstileGuard: `examio-fe/src/components/molecules/TurnstileGuard.tsx`
- FlashcardSetApi: `examio-fe/src/apis/flashcardSetApi.ts`
- FlashcardStudyApi: `examio-fe/src/apis/flashcardStudyApi.ts`
- AuthStore: `examio-fe/src/stores/useAuthStore.ts`
- Types: `examio-fe/src/types/flashcardSet.ts`
- authRedirect: `examio-fe/src/lib/authRedirect.ts`