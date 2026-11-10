# SCR020: ManageExamRoomPage — Screen Spec

**Screen**: SCR020: ManageExamRoomPage
**Type**: atomic
**Route**: `/k/manage-exam-room`
**Generated**: 2026-06-06

## Purpose

A teacher views and manages their hosted exam rooms — creating, editing, and deleting them — accessed from the protected dashboard sidebar under the exam management section.

## Screen Layout

The page renders inside a `TeacherRoute` wrapper with a `max-w-7xl mx-auto` container and standard padding. The layout is a vertical stack: a header row (title + create button), a `RoomStatsSection` stats bar, and a two-column grid (exam room list takes 2/3 width, recent participants sidebar takes 1/3). All regions scroll independently. Two dialogs (`ExamRoomModal`, `DeleteConfirmDialog`) float above the content. Responsive: two-column grid stacks to single column on mobile. (source: `kmaedu-fe/src/pages/k/ManageExamRoomPage.tsx`:207–275)

### Layout Sketch

```
┌─────────────────────────────────────────────────────┐
│ R1: Header (static) — title + Create button          │
├─────────────────────────────────────────────────────┤
│ R2: RoomStatsSection (static) — 4 stat cards        │
├─────────────────────────────┬───────────────────────┤
│ R3: ExamRoomList (scrollable) │ R4: RecentParticipants │
│ (lg:col-span-2)             │ (lg:col-span-1)        │
│                             │                        │
├─────────────────────────────┴───────────────────────┤
│ R5: ExamRoomModal (overlay, conditional)             │
│ R6: DeleteConfirmDialog (overlay, conditional)        │
└─────────────────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|-----------|----------------|---------------------|
| R1 | Header | static | no | `h1`, `Button` | fluid |
| R2 | RoomStatsSection | static | no | `RoomStatsSection` | 4-col grid → 2-col on mobile |
| R3 | ExamRoomList | static | yes | `ExamRoomList`, `ExamRoomModal`, `DeleteConfirmDialog` | full-width-sm |
| R4 | RecentParticipantsList | static | no | `RecentParticipantsList` | hidden-sm on mobile |
| R5 | ExamRoomModal | overlay | no | `ExamRoomModal` | modal on all sizes |
| R6 | DeleteConfirmDialog | overlay | no | `DeleteConfirmDialog` | modal on all sizes |

## User Flow

### Happy Path

1. User lands on `/k/manage-exam-room`; `TeacherRoute` checks auth → renders content
2. On mount, `fetchAllExamRooms()` loads all exam rooms; `fetchAllQuizSets()` loads quiz set options for the create/edit form
3. Skeleton loader renders while `loading && examRooms.length === 0`
4. On resolve, `RoomStatsSection` renders stats (computed from `examRooms`); `ExamRoomList` renders room cards
5. `fetchRecentParticipants()` runs after `examRooms` resolves — parallel-fetches up to 10 recent attempts per room via `getExamAttemptsByRoomApi`, sorts by recency, takes top 5
6. User clicks "Tạo phòng thi mới" → `ExamRoomModal` opens in create mode
7. User fills form (title, description, quiz set selection) and submits → `handleCreateSubmit()` calls `createExamRoom()` → modal closes, list refreshes
8. User clicks View on a room card → `navigate(`/k/manage-exam-room/${id}`)` → navigates to SCR027 detail page
9. User clicks Edit on a room card → `handleEditRoom(id)` pre-fills form + opens `ExamRoomModal` in edit mode
10. User clicks Delete on a room card → `DeleteConfirmDialog` opens
11. User confirms deletion → `deleteExamRoom()` → list refreshes

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| `loading && examRooms.length === 0` | initial load | skeleton UI (4 stat card skeletons + list skeleton) | `ManageExamRoomPage.tsx:190` |
| No exam rooms | `examRooms.length === 0` after load | `ExamRoomList` renders empty state | `ManageExamRoomPage.tsx:226` |
| Recent participants fetch fails | `getExamAttemptsByRoomApi` throws | silently returns empty result; sidebar shows empty state | `ManageExamRoomPage.tsx:51` |
| Create fails | `createExamRoom()` throws | error logged; modal stays open | `ManageExamRoomPage.tsx:152` |
| Edit pre-fill | `examRooms.find(id)` | `editFormData` populated with room data | `ManageExamRoomPage.tsx:131` |
| Delete fails | `deleteExamRoom()` throws | error logged; dialog stays open | `ManageExamRoomPage.tsx:186` |
| Edit form pre-fill | `examRooms.find(id)` | `editFormData` populated; modal opens | `ManageExamRoomPage.tsx:131` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| stats.activeRooms | Phòng thi đang hoạt động | computed `examRooms.length` | integer | `0` | `MODEL-017.id` |
| stats.totalParticipants | Tổng số buổi thi | computed `examRooms.reduce(_count.examSessions)` | integer | `0` | `MODEL-018.id` |
| stats.ongoingExams | Đang diễn ra | hardcoded `0` | integer | `0` | `N/A` |
| stats.completedToday | Hoàn thành hôm nay | hardcoded `0` | integer | `0` | `N/A` |
| room.id | ID phòng thi | `examRooms[].id` | cuid | hidden | `MODEL-017.id` |
| room.name | Tên phòng thi | `examRooms[].title` | string | `—` | `MODEL-017.title` |
| room.roomType | Bộ đề | `examRooms[].quizSet?.title` | string | `Chưa có bộ đề` | `MODEL-007.title` |
| room.questionCount | Số câu hỏi | `examRooms[].quizSet?._count?.detailsQuizQuestions` | integer | `0` | `MODEL-010.id` |
| room.isPrivate | Riêng tư | hardcoded `false` | boolean | `—` | `N/A` |
| participant.id | ID attempt | derived from `getExamAttemptsByRoomApi` | cuid | hidden | `MODEL-019.id` |
| participant.name | Tên thí sinh | `attempt.user.name \|\| attempt.user.username` | string | `—` | `MODEL-001.name` |
| participant.examName | Tên bài thi | `attempt.examRoomTitle` | string | `—` | `MODEL-017.title` |
| participant.avatar | Avatar | `attempt.user.avatar` | URL string | hidden | `MODEL-001.avatar` |
| quizSetOptions | Danh sách bộ đề | `fetchAllQuizSets()` → `quizSetsK` | array of `{id, title, questionCount}` | empty select | `MODEL-007.id` |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | `loading && examRooms.length === 0` | skeleton UI (4 stat card skeletons + list skeleton) | none | `ManageExamRoomPage.tsx:190` |
| loadingParticipants | `loadingParticipants` | skeleton card in sidebar | none | `ManageExamRoomPage.tsx:238` |
| empty (no rooms) | `examRooms.length === 0` after load | empty state in `ExamRoomList` | N/A | `ManageExamRoomPage.tsx:226` |
| empty (no participants) | `recentParticipants.length === 0` after load | empty state in `RecentParticipantsList` | N/A | `ManageExamRoomPage.tsx:243` |
| create modal open | `isCreateModalOpen` | `ExamRoomModal` in create mode | fill + submit or cancel | `ManageExamRoomPage.tsx:249` |
| edit modal open | `isEditModalOpen` | `ExamRoomModal` pre-filled with room data | fill + submit or cancel | `ManageExamRoomPage.tsx:258` |
| delete dialog open | `isDeleteDialogOpen` | `DeleteConfirmDialog` modal | confirm or cancel | `ManageExamRoomPage.tsx:268` |
| success (create/edit/delete) | mutation resolves | modal/dialog closes; list refreshes | dismiss | `ManageExamRoomPage.tsx:150,168,183` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| title | string | yes | min 1 char (handled by `ExamRoomModal` form) | none | per form component |
| description | string | no | none | none | N/A |
| quizSetId | string | yes | must match existing quiz set ID | none | per form component |

### B) Server-side

#### Create exam room
- **Endpoint:** `POST /api/v1/examrooms` → via `createExamRoom()` in `useExamRoomStore`
- **Request:** `{ title, description, quizSetId }`
- **Success:** `201` → list refreshes; modal closes
- **Errors:** `[UNVERIFIED]` server error → logged to console; modal stays open
- **Trigger:** `ExamRoomModal` form submit (create mode)
- **Source:** `ManageExamRoomPage.tsx:142–156`

#### Update exam room
- **Endpoint:** `PUT /api/v1/examrooms/:id` → via `updateExamRoom()` in `useExamRoomStore`
- **Request:** `{ title, description, quizSetId }`
- **Success:** `200` → list refreshes; modal closes
- **Errors:** `[UNVERIFIED]` server error → logged to console; modal stays open
- **Trigger:** `ExamRoomModal` form submit (edit mode)
- **Source:** `ManageExamRoomPage.tsx:158–176`

#### Delete exam room
- **Endpoint:** `DELETE /api/v1/examrooms/:id` → via `deleteExamRoom()` in `useExamRoomStore`
- **Request:** `{ id }`
- **Success:** `200` → list refreshes; dialog closes
- **Errors:** `[UNVERIFIED]` server error → logged to console; dialog stays open
- **Trigger:** confirm in `DeleteConfirmDialog`
- **Source:** `ManageExamRoomPage.tsx:178–188`

#### Fetch exam rooms
- **Endpoint:** `GET /api/v1/examrooms/list` → via `fetchAllExamRooms()` in `useExamRoomStore`
- **Request:** none
- **Success:** `200` → `examRooms` state updated
- **Errors:** silent (no visible error state)
- **Trigger:** mount
- **Source:** `ManageExamRoomPage.tsx:36`

#### Fetch quiz sets (for form dropdown)
- **Endpoint:** `GET /api/v1/quizsets` → via `fetchAllQuizSets()` in `useQuizSetStore`
- **Request:** none
- **Success:** `200` → `quizSetsK` state updated
- **Errors:** silent
- **Trigger:** mount
- **Source:** `ManageExamRoomPage.tsx:40`

#### Fetch recent participants
- **Endpoint:** `GET /api/v1/exam-attempts/room/:roomId` → via `getExamAttemptsByRoomApi()` — called per room in parallel
- **Request:** `{ roomId, page: 1, limit: 10, includeUser: true }`
- **Success:** `200` → `recentParticipants` state (top 5 by recency)
- **Errors:** silently returns `{ attempts: [], total: 0 }` per failed room
- **Trigger:** after `examRooms` resolves
- **Source:** `ManageExamRoomPage.tsx:44–92`

## Interaction Patterns

- **Parallel participant fetch** — `Promise.all` fetches recent attempts for all rooms simultaneously; each failure returns a safe empty result to avoid blocking the whole list; source: `ManageExamRoomPage.tsx:50–58`
- **Recent participants transformation** — attempts sorted by `startedAt` descending, top 5 selected, enriched with `examRoomTitle` from the parent room; source: `ManageExamRoomPage.tsx:72–78`
- **Edit pre-fill from store** — `handleEditRoom(id)` reads room directly from `examRooms` store state (not re-fetched); source: `ManageExamRoomPage.tsx:126`
- **Computed stats from examRooms** — `activeRooms` = total count; `totalParticipants` = sum of `_count.examSessions` per room; source: `ManageExamRoomPage.tsx:94–104`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | `aria-label` on edit/delete buttons via `Button` component |
| Keyboard navigation | unknown | no explicit keyboard shortcuts; buttons support tab |
| Focus management | unknown | no explicit focus management in page |
| Screen reader compatibility | unknown | no semantic landmarks confirmed |

[NO_A11Y_DETECTED] — accessibility audit needed before production release.

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `loading && examRooms.length === 0` | data-driven | skeleton UI | full content | `ManageExamRoomPage.tsx:190` |
| `loadingParticipants` | data-driven | skeleton card in sidebar | `RecentParticipantsList` | `ManageExamRoomPage.tsx:238` |
| `isCreateModalOpen` | feature-flag | `ExamRoomModal` (create mode) | — | `ManageExamRoomPage.tsx:249` |
| `isEditModalOpen` | feature-flag | `ExamRoomModal` (edit mode, pre-filled) | — | `ManageExamRoomPage.tsx:258` |
| `isDeleteDialogOpen` | feature-flag | `DeleteConfirmDialog` | — | `ManageExamRoomPage.tsx:268` |
| `examRooms.length === 0` after load | data-driven | empty state in `ExamRoomList` | room cards | via template |
| `recentParticipants.length === 0` after load | data-driven | empty state in `RecentParticipantsList` | participant list | `ManageExamRoomPage.tsx:243` |

## Component Variants

Omit — no shared polymorphic component rendered on this page.

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `TeacherRoute` wrapper | auth | Renders nothing; redirects to `/login` if unauthenticated; redirects to `/` if authenticated but not teacher |
| Route guard on `/k/manage-exam-room` | auth | Same as above — parent K layout handles route-level guard |

`TeacherRoute` is a client-side auth gate. `[UNVERIFIED]` server enforcement — static analysis cannot confirm API middleware.

## Source References

- Page: `kmaedu-fe/src/pages/k/ManageExamRoomPage.tsx`
- Exam room store: `kmaedu-fe/src/stores/useExamRoomStore.ts`
- Quiz set store: `kmaedu-fe/src/stores/useQuizSetStore.ts`
- Exam attempt API: `kmaedu-fe/src/apis/examAttemptApi.ts`
- RoomStatsSection: `kmaedu-fe/src/components/organisms/k/RoomStatsSection.tsx` (referenced, not read)
- ExamRoomList: `kmaedu-fe/src/components/organisms/k/ExamRoomList.tsx` (referenced, not read)
- RecentParticipantsList: `kmaedu-fe/src/components/organisms/k/RecentParticipantsList.tsx` (referenced, not read)
- ExamRoomModal: `kmaedu-fe/src/components/organisms/ExamRoomModal.tsx` (referenced, not read)
- DeleteConfirmDialog: `kmaedu-fe/src/components/organisms/DeleteConfirmDialog.tsx` (referenced, not read)
- TeacherRoute: `kmaedu-fe/src/components/organisms/TeacherRoute.tsx`
