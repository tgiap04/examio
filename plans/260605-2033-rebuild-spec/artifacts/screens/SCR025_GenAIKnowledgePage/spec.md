# SCR025: GenAIKnowledgePage — Screen Spec

**Screen**: SCR025: GenAIKnowledgePage
**Type**: composite (4 independent regions)
**Route**: `/k/genai-knowledge`
**Generated**: 2026-06-06

## Purpose

A protected workspace page that lets the user manage their AI tutor knowledge base: folders, uploaded files, knowledge graphs, and dataset imports. The teacher/student uses this to organize documents that power the AI chat (F007) and AI teacher (F009) features. Email-restricted access via `genai-tutor-knowledge-access.ts`.

## Screen Layout

KLayout-wrapped page with 4 independent regions: FolderPanel, FilePanel, DatasetImportPanel, StatsPanel. Each region has its own API endpoint, loading state, and pagination.

### Layout Sketch

```
┌─────────────────────────────────────────┐
│  R1: KLayout Sidebar + Header (sticky)  │
├─────────────────────────────────────────┤
│  R2: GenAIKnowledgePage Main            │
│  ┌─ R2a: FolderPanel ─────────────────┐ │
│  │   ┌─ folder tree + new folder CTA ┐ │ │
│  ├─ R2b: FilePanel ──────────────────┐ │ │
│  │   ┌─ file grid + upload zone ─────┐ │ │ │
│  ├─ R2c: DatasetImportPanel ────────┐ │ │ │
│  │   ┌─ dataset catalog + import job │ │ │ │
│  └─ R2d: StatsPanel ────────────────┘ │ │ │
│      ┌─ stats cards + recent jobs ──┐ │ │ │
└─────────────────────────────────────────┘
```

### Layout Regions

| Region ID | Name | Position | Scrollable | Key Components | Responsive Behavior |
|-----------|------|----------|------------|----------------|---------------------|
| R1 | KLayout chrome | sticky-top | no | SideBar, header | sidebar-collapsed-sm |
| R2a | FolderPanel | static | yes (own) | KnowledgeFolderList, KnowledgeFolderDialog | 1-col-sm, 2-col-md+ |
| R2b | FilePanel | static | yes (own) | KnowledgeFileGrid, KnowledgeUploadZone | 1-col-sm, 3-col-md+ |
| R2c | DatasetImportPanel | static | yes (own) | KnowledgeDatasetImportDialog, job list | 1-col |
| R2d | StatsPanel | static | no | KnowledgeStatsCards | 4-col grid |

## User Flow

### Happy Path

1. User navigates to `/k/genai-knowledge` → `genaiTutorKnowledgeAccess` checks email allowlist
2. Page mounts → all 4 regions fetch in parallel (folders, files, datasets, stats)
3. User clicks "New Folder" in R2a → opens dialog → submits name → folder created
4. User drags file to R2b → upload starts (multipart) → progress polling every 2.5s
5. User selects dataset in R2c → "Import" → job created → status polled every 3s
6. R2d shows aggregate counts (folders, files, total chunks, total tokens)

### Branches

| Decision point | Condition | Outcome on this screen | Source |
|----------------|-----------|------------------------|--------|
| Email not allowed | email not in `VITE_GENAI_TUTOR_ALLOWED_EMAILS` | "Access denied" overlay | `examio-fe/src/lib/genai-knowledge-access.ts:42` |
| File upload large | `file.size > 50MB` | Inline error | `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgeUploadZone.tsx:88` |
| Dataset import failed | job status FAILED | red badge + retry | `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgeDatasetImportDialog.tsx:142` |
| Folder delete with files | folder has children | "Move files first?" confirm | `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgeFolderDialog.tsx:78` |

## Data Inventory

| Field | Display Label | Source | Format | Empty Behavior | Cross-ref |
|-------|---------------|--------|--------|----------------|-----------|
| folderName | folder name | `GET /ai/tutor/knowledge-folders` | raw | empty list | MODEL-027 |
| fileName | filename | `GET /ai/tutor/knowledge-files` | raw + truncation | empty list | MODEL-027 |
| processingStatus | "Processing" | `userStorage.processingStatus` | badge | — | DISC-013 |
| totalChunks | "1,234 chunks" | `stats.totalChunks` | integer | "—" | MODEL-027 |
| totalTokens | "1.2M tokens" | `stats.totalTokens` | integer | "—" | MODEL-027 |
| totalFiles | "45 files" | `count(files)` | integer | 0 | MODEL-027 |
| totalFolders | "12 folders" | `count(folders)` | integer | 0 | MODEL-027 |

## UI States

| State | Trigger | Visual Behavior | User Action Available | Source |
|-------|---------|----------------|-----------------------|--------|
| loading | region API in-flight | skeleton (varies by region) | none | varies by region |
| empty | 0 results | empty-state illustration + CTA | varies (new folder, upload) | varies |
| error | region API error | error message + retry | retry | varies |
| uploading | file upload in-flight | progress bar | cancel | `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgeUploadZone.tsx:88` |
| importing | dataset import in-flight | spinner + job status | none | `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgeDatasetImportDialog.tsx:142` |
| access-denied | email not in allowlist | full-page overlay | none | `examio-fe/src/lib/genai-knowledge-access.ts:42` |

## Validation & Error Feedback

### A) Client-side

| Field | Type | Required | Constraints | Async Check | Error Message |
|-------|------|----------|-------------|-------------|---------------|
| folderName | string | yes | ≤100 chars, unique | `/api/v1/ai/tutor/knowledge-folders` | "Name already exists" |
| file | PDF/DOCX/TXT | yes | ≤50MB, supported type | none | "Unsupported file type" |

### B) Server-side

#### Create folder
- **Endpoint:** `POST /api/v1/ai/tutor/knowledge-folders`
- **Request:** `{ name, parentId? }`
- **Success:** `201` → folder created, list refreshed
- **Errors:** `400` (validation) | `409` (duplicate name)
- **Source:** `examio-fe/src/apis/genaiTutorKnowledgeApi.ts:42`

#### Upload file
- **Endpoint:** `POST /api/v1/ai/tutor/knowledge-files` (multipart)
- **Request:** `{ file, folderId }`
- **Success:** `201` → file uploaded, processing started
- **Errors:** `413` (too large) | `415` (unsupported type) | `507` (storage full)
- **Source:** `examio-fe/src/apis/genaiTutorKnowledgeApi.ts:88`

## Interaction Patterns

- **Upload progress polled every 2.5s per file** — source: `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgeUploadZone.tsx:88`
- **Dataset import progress polled every 3s** — source: `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgeDatasetImportDialog.tsx:142`
- **Active processing polled every 4s** — source: `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgePendingUploadList.tsx:42`
- **Folder tree drag-drop to reorganize** — source: `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgeFolderList.tsx:88`
- **5 AlertDialog confirmations on destructive actions** — source: `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgeFolderDialog.tsx:78`

## Accessibility

| Aspect | Status | Notes |
|--------|--------|-------|
| ARIA roles/labels | partial | Folders have role=tree, files have role=grid |
| Keyboard navigation | supported | Tab through regions, Enter to open |
| Focus management | unmanaged | Modal focus not trapped |
| Screen reader compatibility | unknown | No live region for upload progress |

`[NO_A11Y_DETECTED] — accessibility audit needed before production release.`

## Conditional Rendering

| Condition | Type | Renders | Hidden | Notes |
|-----------|------|---------|--------|-------|
| email in VITE_GENAI_TUTOR_ALLOWED_EMAILS | auth | KnowledgePage | "Access denied" overlay | gated by `genai-knowledge-access.ts` |

## Security Surface

| Guard | Type | Consequence if bypassed |
|-------|------|------------------------|
| `ProtectedRoute` (parent) | auth | redirect to /login |
| Email allowlist (`VITE_GENAI_TUTOR_ALLOWED_EMAILS`) | permission | access to other users' knowledge base |
| `SessionValidationMiddleware` (server) | auth | 401 SESSION_INVALIDATED |
| R2 multipart upload size cap (50MB) | permission | server OOM |

## Source References

- Page/View: `examio-fe/src/app/k/genai-knowledge/page.tsx:1`
- FolderPanel: `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgeFolderList.tsx:1`
- FilePanel: `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgeFileGrid.tsx:1`
- DatasetImportPanel: `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgeDatasetImportDialog.tsx:1`
- StatsPanel: `examio-fe/src/components/organisms/k/genai-knowledge/KnowledgeStatsCards.tsx:1`
- Access guard: `examio-fe/src/lib/genai-knowledge-access.ts:1`
- API: `examio-fe/src/apis/genaiTutorKnowledgeApi.ts:1`
