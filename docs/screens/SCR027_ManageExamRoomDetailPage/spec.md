# SCR027: ManageExamRoomDetailPage — Screen Spec

**Screen**: SCR027: ManageExamRoomDetailPage
**Type**: composite (8 independent regions)
**Route**: `/k/manage-exam-room/:id`
**Generated**: 2026-06-06

## Purpose

A protected workspace page that lets the host (quiz set owner) manage a single exam room: view stats, create/edit/delete sessions, manage participants via sharing/access-code, and navigate to per-session analytics. The teacher uses this to operate an exam end-to-end.

## Screen Layout

KLayout-wrapped page with the shared `ExamRoomDetailTemplate` component. 4 top-level regions (StatsGrid, RoomInfoSection, SessionTable, ShareDialog) plus nested session-level analytics.

### Layout Sketch

```
┌─────────────────────────────────────────┐
│  R1: KLayout Sidebar + Header (sticky)  │
├─────────────────────────────────────────┤
│  R2: ExamRoomDetailTemplate Main        │
│  ┌─ R2a: StatsGrid (4 cards) ─────────┐ │
│  │   total/ongoing/participants/      │ │
│  │   attempts                        │ │
│  ├─ R2b: RoomInfoSection ────────────┐ │ │
│  │   title, description, quiz set   │ │ │
│  ├─ R2c: SessionTable ──────────────┐ │ │ │
│  │   list of sessions + create CTA │ │ │ │
│  └─ R2d: ShareDialog (modal) ───────┘ │ │ │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | KLayout chrome | sticky-top | no | SideBar, header | sidebar-collapsed-sm |
| R2a | StatsGrid | static | no | RoomStatsSection, StatCard | 2x2 grid-sm, 4-col-md+ |
| R2b | RoomInfoSection | static | no | RoomInfoRow | fluid |
| R2c | SessionTable | static | yes (own) | ExamTable, ExamTablePagination | full-width |
| R2d | ShareDialog | modal overlay | no | ShareFlashcardModal-style dialog | centered modal |

## User Flow

### Happy Path

1. User navigates from ManageExamPage → click "View" on a room row → `useExamRoomDetailStore.fetchSessions(roomId)` + `useExamRoomStore.fetchExamRoomById(id)`
2. StatsGrid fetches `GET /api/v1/examrooms/:id/stats`
3. SessionTable paginates sessions (default 20/page)
4. User clicks "Create Session" → opens modal → selects time/access mode → submits → `POST /api/v1/examsessions`
5. User clicks "View Analytics" on session row → navigates to `/k/manage-exam-room/:id/session/:sessionId`
6. User clicks "Share" → ShareDialog → sets access type (public/private/whitelist) → submits

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| Empty sessions | `sessions.length === 0` | empty-state + "Create your first session" CTA | `kmaedu-fe/src/components/organisms/k/ExamTable.tsx:88` |
| Delete room | confirm dialog | room deleted, navigate to /k/manage-exam | `kmaedu-fe/src/components/organisms/k/DialogAddExam.tsx:142` |
| Regenerate access code | access type = private | 6-digit code generated + displayed | `kmaedu-fe/src/components/organisms/k/ExamTable.tsx:188` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| roomTitle | Exam room title | `useExamRoomStore.currentExamRoom.title` | raw | — | MODEL-016 |
| totalSessions | "12 sessions" | `sessionsTotal` | integer | 0 | MODEL-018 |
| totalParticipants | "45 participants" | `totalDistinctParticipants` | integer | 0 | MODEL-019 |
| totalAttempts | "128 attempts" | `count(attempts)` | integer | 0 | MODEL-019 |
| quizSetTitle | Quiz set name | `examRoom.quizSet.title` | raw | — | MODEL-005 |
| sessionStatus | "Ongoing" / "Ended" / "Upcoming" | `session.status` (0/1/2) | badge | — | DISC-001 |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | regions fetching | skeleton cards + table rows | none | varies |
| empty | 0 sessions | empty-state + CTA | create session | `kmaedu-fe/src/components/organisms/k/ExamTable.tsx:88` |
| error | API error | error message + retry | retry | varies |
| deleting | mutation in-flight | spinner on row | none | `kmaedu-fe/src/components/organisms/k/DialogAddExam.tsx:142` |
| share-modal | User clicks Share | ShareDialog opens | configure + submit | `kmaedu-fe/src/components/organisms/k/ExamTable.tsx:188` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| sessionTitle | string | yes | ≤200 chars | none | "Title too long" |
| startTime | ISO datetime | yes | > now | none | "Start time must be in the future" |
| timeLimit | integer | no | 1-480 min | none | "1-480 minutes" |

### B) Server-side

#### Create session
- **Endpoint:** `POST /api/v1/examsessions`
- **Request:** `{ examRoomId, title, startTime, endTime, timeLimitMinutes, accessType, accessCode? }`
- **Success:** `201` → session created, list refreshed
- **Errors:** `400` (validation) | `403` (not owner) | `409` (time conflict)
- **Source:** `kmaedu-fe/src/apis/examSessionApi.ts:42`

#### Update sharing
- **Endpoint:** `PUT /api/v1/examsessions/:id/sharing`
- **Request:** `{ assessType, accessCode?, whitelist? }`
- **Success:** `200` → sharing updated
- **Source:** `kmaedu-fe/src/apis/examSessionApi.ts:88`

## Interaction Patterns

- **Pagination via URL state** — source: `kmaedu-fe/src/components/organisms/k/ExamTablePagination.tsx:42`
- **Delete with double confirmation** — source: `kmaedu-fe/src/components/organisms/DeleteConfirmDialog.tsx:31`
- **Share dialog regenerates access code on demand** — source: `kmaedu-fe/src/apis/examSessionApi.ts:128`
- **Cache invalidation after create/update/delete** — source: `kmaedu-fe/src/stores/useExamRoomDetailStore.ts:88`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | Table has role=table, action buttons have aria-label |
| Keyboard navigation | supported | Tab through rows, Enter to open |
| Focus management | unmanaged | Modal focus not trapped |
| Screen reader compatibility | unknown | Pagination not announced |

`[NO_A11Y_DETECTED] — accessibility audit needed before production release.`

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| `user.isHost === true` | permission | "Create Session" CTA + delete buttons | "Share" button if not host |
| `assessType === 1` (PRIVATE) | feature-flag | "Generate Code" button | — |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `ProtectedRoute` (parent) | auth | redirect to /login |
| Host ownership check (server) | permission | cross-user data modification |
| `SessionValidationMiddleware` (server) | auth | 401 SESSION_INVALIDATED |
| Access code (6-digit) for PRIVATE sessions | permission | bypass = direct quiz access |

## Source References

- Page/View: `kmaedu-fe/src/pages/k/ManageExamRoomDetailPage.tsx:1`
- Template: `kmaedu-fe/src/templates/ExamRoomDetailTemplate.tsx:1`
- Store: `kmaedu-fe/src/stores/useExamRoomDetailStore.ts:1`
- API: `kmaedu-fe/src/apis/examRoomApi.ts:42` + `kmaedu-fe/src/apis/examSessionApi.ts:42`
- Share dialog: `kmaedu-fe/src/components/organisms/ShareFlashcardModal.tsx:1` (reused)
