# F005 Technical Spec - Flashcard Authoring & Study

## Functional Requirements
- FR001: Authenticated users can create, list, search, view, update, and delete flashcard sets they own or can access.
- FR002: Users can add, edit, delete, and organize flashcards inside a flashcard set.
- FR003: Users can manage labels/tags and sharing/access settings for flashcard sets where ownership permits.
- FR004: Users can start a flashcard study flow for an accessible set from web `/study-flashcard/:id` or workspace entry points.
- FR005: Study flow records progress and answer submissions through the flashcard study API.
- FR006: Student material surfaces can show recent/pinned/shared flashcard sets where available.
- FR007: Mobile flashcard/study screens are represented in Android/iOS UI, but current platform feature screens are mock-backed; API wiring Needs verification.

## Business Rules
- BR001: Creating or managing flashcard sets requires authentication. Source: PERM019, PERM020.
- BR002: Viewing/studying a set requires ownership, public/shared access, or valid access code where supported. Exact public/share rules Need verification. Source: PERM018, PERM021.
- BR003: Mutations must invalidate cached flashcard/student-material data so stale sets are not reused. Source: BL032.
- BR004: Standalone study route has no web route guard; backend/API access checks are required. Source: FLW022, SCR030.

## State Management
- SM001: Web uses `useFlashcardSetStore` and `flashcardSetApi.ts` for set/card state.
- SM002: Web uses `flashcardStudyApi.ts` for progress and answer submissions.
- SM003: Store cache is reused for reads and invalidated after create/update/delete operations. Source: BL032.
- SM004: Mobile shared `FlashcardRepository`/`FlashcardApiService` exists; Android/iOS screens are mock-backed. Source: SCR112, SCR209, BL070-BL072.

## Algorithms
- ALG001: Study session loads an accessible flashcard set, presents cards, accepts recall/answer actions, posts progress, then posts answer result per card.
- ALG002: Set access resolution should check owner/shared/public/access-code rules before exposing card contents. Exact precedence Needs verification.

## Integrations
- INT001: API004 `/api/v1/flashcardsets/*` for set/card/label CRUD.
- INT002: API004 `/api/v1/flashcard-study/*` for progress and answer submission.
- INT003: API010 `/api/v1/student/*` for recent/pinned material access where flashcards appear.

## Key Entities
- MODEL015 `FlashCardSet`
- MODEL016 `FlashCard`
- MODEL017 `DetailsFlashCard`
- MODEL053 mobile `FlashcardModels.kt`

## Artifact References
- `feature-list.md` F005
- `user-stories.md` US007
- `screen-list.md` SCR017, SCR023, SCR030, SCR112, SCR209
- `screen-flow.md` FLW021, FLW022, FLW023
- `behavior-logic.md` BL031, BL032, BL033, BL034
- `api-map.md` API004, API010
- `permissions.md` PERM018-PERM022
- Source paths: web `src/apis/flashcardSetApi.ts`, `src/apis/flashcardStudyApi.ts`, `src/stores/useFlashcardSetStore.ts`; mobile KMP `FlashcardApiService`, `FlashcardRepository`; exact file locations Need verification.
