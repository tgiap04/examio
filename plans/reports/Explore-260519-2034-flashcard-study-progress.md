# Workshop Survey Report: Flashcard Study Progress

## Relevant Files
- `examio-fe/src/routes/index.tsx` - Defines `/k/flash-card`, public `/study-flashcard/:id`, and protected `/k/manage-flashcard-set/:id` routes.
- `examio-fe/src/pages/study-flashcard/FlashcardStudyPage.tsx` - Actual study UI. Loads set through `checkFlashcardSetAccess`, `getFlashcardSetPublicInfo`, `getFlashcardSetForStudy`; keeps `currentCardIndex`, `isFlipped`, and `studiedCards` in local React state only.
- `examio-fe/src/apis/flashcardSetApi.ts` - API calls used by study page: `GET /flashcardsets/study/:id/access`, `GET /flashcardsets/study/:id/info`, `GET /flashcardsets/study/:id`, `POST /flashcardsets/study/:id/with-code`. No study progress save API here.
- `examio-fe/src/apis/flashcardStudyApi.ts` - Defines intended progress/session APIs for `/flashcard-study/*` (`session`, `review`, `history`, `progress`), but no imports/usages from the actual study page were found.
- `examio-fe/src/types/flashcardSet.ts` - Contains frontend-only types for `FlashcardStudySession` and `FlashcardSetProgress`, plus normal set/card/access types.
- `examio-fe/src/pages/k/ManageFlashcardSetDetailPage.tsx` - Owner/detail management page. Displays total cards, view count, created date, labels, and paginated cards; no learner progress display.
- `examio-fe/src/pages/k/MyMaterialsPage.tsx` - Student materials page. `handleReview` navigates to `/study-flashcard/${setId}`; share link falls back to same study route.
- `examio-fe/src/pages/k/FlashcardsPage.tsx` - Protected flashcard set management list. Stats are groups/cards/views; manage route is `/k/manage-flashcard-set/:id`.
- `examio-be/apps/exam-service/src/modules/flashcardset/flashcardset.controller.ts` - Backend study/access endpoints under `/flashcardsets/study/:id...`; no progress/attempt endpoints in this module.
- `examio-be/apps/exam-service/src/modules/flashcardset/flashcardset.service.ts` - `getFlashcardSetForStudy` and `getFlashcardSetWithCode` increment `viewCount` and create `FlashCardViewHistory` if authenticated; they return all flashcards and creator info.
- `examio-be/apps/gateway-service/src/controllers/ai-study-proxy.controller.ts` - Gateway proxy exposes `/flashcard-study/*` endpoints to an upstream service path, but repository search found no corresponding implementation in `exam-service`, `ai-service`, or Prisma models.
- `examio-be/libs/database/src/models/exam.prisma` - Flashcard models are `FlashCardSet`, `FlashCardSetLabel`, `FlashCard`, `DetailsFlashCard`, `FlashCardViewHistory`, `UserPinnedFlashcard`, and `HistoryGeneratedFlashcard`; quiz has `QuizPracticeAttempt`, but flashcards have no `FlashcardPractice`, `FlashcardAttempt`, or `FlashcardProgress` model.

## Study Flow
1. User navigates to `/study-flashcard/:id` from `MyMaterialsPage` or a shared link.
2. `FlashcardStudyPage` checks access via `/flashcardsets/study/:id/access`.
3. If access is allowed, it loads all cards via `/flashcardsets/study/:id`; if code is needed, it shows a modal then posts to `/flashcardsets/study/:id/with-code`.
4. Backend increments `FlashCardSet.viewCount` and, for authenticated users, inserts a `FlashCardViewHistory` record.
5. Frontend displays a flip card, previous/next navigation, card number strip, sound toggle, and a progress bar.
6. The progress bar is computed from local `studiedCards.size / totalCards`; a card is marked studied only when clicking Next from it.

## Progress Save/Display Findings
- There is no active persistence of card-level study progress in the current study page. `studiedCards` is a component-local `Set`, so refresh/navigation resets it.
- The only persisted study-adjacent data is `viewCount` and `FlashCardViewHistory` when a set is loaded. This records that a set was viewed, not which cards were studied, correctness, mastery, or resume state.
- `flashcardStudyApi.ts` and `FlashcardStudySession`/`FlashcardSetProgress` types suggest a planned API design, but the actual page does not call them and no matching Prisma models/backend implementation were found except gateway proxy stubs.
- The flashcard set detail page displays total cards, views, and creation date; it does not display learner progress.
- Prisma contains no `FlashcardPractice`, `FlashcardAttempt`, or `FlashcardProgress` models. The closest flashcard-related persisted model is `FlashCardViewHistory`; quiz practice attempts exist only for quiz sets.

## Relevant Code Notes
- `FlashcardStudyPage.tsx:72` initializes `studiedCards` locally.
- `FlashcardStudyPage.tsx:187` / `:192` / `:194` marks the current card studied during `handleNext`.
- `FlashcardStudyPage.tsx:317` / `:319` computes local progress percentage.
- `flashcardset.service.ts:1131` increments view count; `:1155` creates view history.
- `flashcardset.service.ts:1195` increments view count for code access; `:1219` creates view history.

## Unresolved Questions
- Are the `/flashcard-study/*` proxy endpoints meant to target a service outside this repository, or are they dead/planned code?
- Should progress be per user per flashcard set, per study session, or spaced-repetition per card?
