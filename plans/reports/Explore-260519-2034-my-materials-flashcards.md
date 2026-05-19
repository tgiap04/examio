# My Materials Flashcard Progress Survey

## Summary
- `/k/my-materials` renders `MyMaterialsPage`, a recent/public/owned flashcard-set grid, not a per-user learning dashboard.
- Flashcard learning progress is displayed only if `material.progress !== undefined`, but the backend explicitly returns `progress: undefined`, so the progress bar does not render.
- The study page tracks `studiedCards` only in React component state for the current browser session; it is not persisted.
- Prisma has flashcard set/card/view/pin models, but no flashcard study session/review/progress/attempt models.
- A frontend `flashcardStudyApi.ts` and TS types exist for sessions/progress/reviews, but no matching backend module/endpoints or Prisma models were found.
- Quiz practice attempts exist and are persisted via `QuizPracticeAttempt`; this appears quiz-only, not flashcard-related.

## Relevant Files
- `examio-fe/src/routes/index.tsx` - maps `/k/my-materials` to `MyMaterialsPage`; maps `/study-flashcard/:id` to `FlashcardStudyPage`.
- `examio-fe/src/pages/k/MyMaterialsPage.tsx` - loads recent flashcard sets, displays optional progress, share/pin/review actions.
- `examio-fe/src/apis/studentMaterialsApi.ts` - client for `/student/recent-flashcards`, includes optional `progress?: number`.
- `examio-be/apps/exam-service/src/modules/student/student.controller.ts` - backend routes for recent flashcards/exams and pinning.
- `examio-be/apps/exam-service/src/modules/student/student.service.ts` - builds My Materials response and sets `progress: undefined`.
- `examio-fe/src/pages/study-flashcard/FlashcardStudyPage.tsx` - flashcard study UI; progress is local `studiedCards.size / totalCards`.
- `examio-fe/src/apis/flashcardStudyApi.ts` - unused frontend API wrapper for study sessions/reviews/progress endpoints.
- `examio-fe/src/types/flashcardSet.ts` - frontend-only study/progress interfaces.
- `examio-fe/src/stores/useFlashcardSetStore.ts` - only flashcard-related store; CRUD/cache for flashcard sets/cards.
- `examio-fe/src/apis/flashcardSetApi.ts` - flashcard-set CRUD plus study access/load endpoints.
- `examio-be/apps/exam-service/src/modules/flashcardset/flashcardset.controller.ts` - backend flashcard CRUD/access/study endpoints.
- `examio-be/apps/exam-service/src/modules/flashcardset/flashcardset.service.ts` - increments `viewCount` and writes view history when studying a set.
- `examio-be/libs/database/src/schema.prisma` - flashcard models and quiz practice attempt model.

## Key Snippets

### Route: `/k/my-materials`
`examio-fe/src/routes/index.tsx`:
```tsx
import MyMaterialsPage from "@/pages/k/MyMaterialsPage";

{
  path: "/k/my-materials",
  element: (
    <ProtectedRoute>
      <KLayout>
        <MyMaterialsPage />
      </KLayout>
    </ProtectedRoute>
  ),
}
```

### My Materials fetch + display
`examio-fe/src/pages/k/MyMaterialsPage.tsx`:
```tsx
const fetchMaterials = useCallback(async (page: number) => {
  setLoading(true)
  const data = await getRecentFlashcardSetsApi(PAGE_SIZE, page)
  setMaterials(data.flashcardSets)
  setTotalPages(data.totalPages)
  setTotal(data.total)
}, [toast])

const handleReview = (setId: string) => {
  navigate(`/study-flashcard/${setId}`)
}
```

Progress UI exists, but is conditional:
```tsx
{material.progress !== undefined && (
  <div className="mt-4">
    <span className="font-medium text-ink">{material.progress}%</span>
    <div className="h-1 overflow-hidden rounded-pill bg-hairline">
      <div className="h-full rounded-pill bg-coral" style={{ width: `${material.progress}%` }} />
    </div>
  </div>
)}
```

### My Materials API contract
`examio-fe/src/apis/studentMaterialsApi.ts`:
```ts
export interface RecentFlashcardSet {
  id: string;
  title: string;
  viewCount: number;
  flashcardCount: number;
  lastViewedAt: string;
  isPinned: boolean;
  progress?: number;
}

export async function getRecentFlashcardSetsApi(limit = 10, page = 1) {
  const response = await api.get("/student/recent-flashcards", { params: { limit, page } });
  return response.data;
}
```

### Backend response disables progress display
`examio-be/apps/exam-service/src/modules/student/student.service.ts`:
```ts
const formattedSets = flashcardSets.map((set) => ({
  id: set.id,
  title: set.title,
  viewCount: set.viewCount,
  flashcardCount: set.detailsFlashCard.length,
  lastViewedAt: set.updatedAt.toISOString(),
  isPublic: set.isPublic,
  isPinned: set.userPins.length > 0,
  progress: undefined,
}));
```

### Flashcard study page progress is local only
`examio-fe/src/pages/study-flashcard/FlashcardStudyPage.tsx`:
```tsx
const [studiedCards, setStudiedCards] = useState<Set<string>>(() => new Set());

const handleNext = () => {
  if (currentCardIndex < flashcards.length - 1) {
    setCurrentCardIndex(currentCardIndex + 1);
    const currentCard = flashcards[currentCardIndex];
    if (currentCard) {
      setStudiedCards((prev) => new Set([...prev, currentCard.id]));
    }
  }
};

const progress = Math.round(((studiedCards.size) / totalCards) * 100);
```
No call is made here to `flashcardStudyApi.ts`; progress resets on reload/navigation.

### Unused frontend flashcard-study API
`examio-fe/src/apis/flashcardStudyApi.ts`:
```ts
export async function getOrCreateStudySessionApi(dto: CreateStudySessionDto) {
  const response = await api.post("/flashcard-study/session", dto);
  return response.data;
}

export async function reviewCardApi(sessionId: string, dto: ReviewCardDto) {
  const response = await api.post(`/flashcard-study/session/${sessionId}/review`, dto);
  return response.data;
}

export async function getProgressApi(flashCardSetId: string) {
  const response = await api.get(`/flashcard-study/progress/${flashCardSetId}`);
  return response.data;
}
```
Search found no matching backend `flashcard-study` module/controller/service under `examio-be/apps/exam-service/src`.

### Flashcard stores
Only one flashcard store was found in `examio-fe/src/stores/`:
`examio-fe/src/stores/useFlashcardSetStore.ts`:
```ts
interface FlashcardSetStore {
  flashcardSetsK: Omit<FlashcardSet, "flashcards">[];
  currentFlashcardSet: FlashcardSet | null;
  loading: boolean;
  error: string | null;
  fetchFlashcardSets: (...) => Promise<any>;
  fetchFlashcardSetById: (id: string) => Promise<void>;
  createFlashcardSet: (...) => Promise<void>;
  updateFlashcardSet: (...) => Promise<void>;
  deleteFlashcardSet: (id: string) => Promise<void>;
  addFlashcard: (...) => Promise<void>;
  updateFlashcard: (...) => Promise<void>;
  deleteFlashcard: (...) => Promise<void>;
}
```
This store handles flashcard set/card CRUD and cache invalidation; it does not track study progress.

### Backend tracks views, not learning progress
`examio-be/apps/exam-service/src/modules/flashcardset/flashcardset.service.ts`:
```ts
const flashcardSet = await this.prisma.flashCardSet.update({
  where: { id },
  data: { viewCount: { increment: 1 } },
  include: { ... },
});

if (userId) {
  await this.prisma.flashCardViewHistory.create({
    data: {
      id: this.generateIdService.generateId(),
      userId,
      flashCardSetId: id,
    },
  }).catch(() => null);
}
```

### Prisma flashcard models
`examio-be/libs/database/src/schema.prisma`:
```prisma
model FlashCardSet {
  id               String   @id @default(cuid())
  title            String
  userId           String
  viewCount        Int      @default(0)
  accessCode       String?
  whitelist        String[] @default([])
  detailsFlashCard DetailsFlashCard[]
  labels           FlashCardSetLabel[]
  viewHistories    FlashCardViewHistory[]
  userPins         UserPinnedFlashcard[]
}

model FlashCard {
  id        String   @id @default(cuid())
  question  String
  answer    String
  detailsFlashCards DetailsFlashCard[]
}

model DetailsFlashCard {
  id             String @id @default(cuid())
  flashCardSetId String
  flashCardId    String
  labelId        String?
  @@unique([flashCardSetId, flashCardId])
}

model FlashCardViewHistory {
  id             String   @id @default(cuid())
  userId         String
  flashCardSetId String
  viewedAt       DateTime @default(now())
}

model UserPinnedFlashcard {
  id             String   @id @default(cuid())
  userId         String
  flashcardSetId String
  pinnedAt       DateTime @default(now())
  @@unique([userId, flashcardSetId])
}
```
No `FlashcardStudySession`, `FlashcardReview`, `FlashcardProgress`, or flashcard attempt model was found.

### Quiz practice attempts exist, but for quiz sets
`examio-be/libs/database/src/schema.prisma`:
```prisma
model QuizPracticeAttempt {
  id              String   @id @default(cuid())
  quizSetId       String
  userId          String
  type            Int      @default(0)
  answers         Json     @default("{}")
  currentIndex    Int      @default(0)
  markedQuestions String[] @default([])
  timeSpentSeconds Int     @default(0)
  isSubmitted     Boolean @default(false)
  score           Float?
  totalQuestions  Int     @default(0)
  correctAnswers  Int     @default(0)
  @@unique([quizSetId, userId, type])
}
```
This provides persisted quiz practice state/attempt tracking, but no equivalent model exists for flashcards.

## Search Coverage
- Frontend route/page scan: `examio-fe/src/routes`, `examio-fe/src/pages/k`, `examio-fe/src/pages/study-flashcard`.
- Frontend flashcard stores: `examio-fe/src/stores/`; only `useFlashcardSetStore.ts` matched.
- Frontend flashcard APIs: `examio-fe/src/apis/flashcardSetApi.ts`, `examio-fe/src/apis/flashcardStudyApi.ts`, `examio-fe/src/apis/studentMaterialsApi.ts`.
- Backend flashcard modules: `examio-be/apps/exam-service/src/modules/flashcardset`, `examio-be/apps/exam-service/src/modules/student`.
- Backend progress/attempt scan: `examio-be/apps/exam-service/src` and Prisma schema for `FlashcardStudy`, `FlashcardReview`, `Progress`, `Attempt`, `QuizPracticeAttempt`, `flashcard-study`.
- Prisma schema checked: `examio-be/libs/database/src/schema.prisma`. A second schema path exists at `examio-be/libs/database/prisma/schema.prisma`; findings should be cross-checked if that file is the generated/deployed source.

## Conclusion
Flashcard progress tracking does not currently exist as a persisted backend feature. The UI has placeholders/types/APIs for progress and study sessions, but My Materials receives `progress: undefined`, and the study page keeps progress only in component memory. The backend persists flashcard views (`FlashCardViewHistory`) and pins (`UserPinnedFlashcard`), and it persists quiz practice attempts (`QuizPracticeAttempt`) for quiz sets only.

## Unresolved Questions
- Which Prisma schema is authoritative in this repo: `examio-be/libs/database/src/schema.prisma` or `examio-be/libs/database/prisma/schema.prisma`?
- Was `flashcardStudyApi.ts` planned work, abandoned work, or generated ahead of backend implementation?
- Should progress mean cards viewed once, cards self-rated/mastered, spaced-repetition due status, or session completion percentage?
