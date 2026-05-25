---
title: "Phase 6: AI Tab"
description: "AITeacher chat with SSE streaming, AITool generator, and History screens"
status: pending
priority: P2
effort: 18h
---

# Phase 6: AI Tab

## Context

- [AITeacherPage](../../examio-fe/src/pages/k/AITeacherPage.tsx)
- [AIToolPage](../../examio-fe/src/pages/k/AIToolPage.tsx)
- [HistoryPage](../../examio-fe/src/pages/k/HistoryPage.tsx)
- [AI chat API](../../examio-fe/src/apis/aiChatApi.ts)
- [AI generator API](../../examio-fe/src/apis/examApi.ts)
- [History API](../../examio-fe/src/apis/historyApi.ts)
- [AI teacher store](../../examio-fe/src/stores/useAITeacherStore.ts)
- Depends on: Phase 1 (shared, especially SSE client)

## Overview

AI tab contains three sub-screens: (1) AI Teacher — chat with virtual teacher using SSE streaming, subject selection, document attachment; (2) AI Tool — generate flashcards/quizzes from PDF upload; (3) History — PDF upload history + exam generation history.

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /ai-chat` | List user's chats |
| `POST /ai-chat` | Create new chat |
| `GET /ai-chat/:id/messages` | Get chat messages |
| `POST /ai-chat/:id/stream` | Stream message (SSE) |
| `PATCH /ai-chat/:id` | Update chat title |
| `DELETE /ai-chat/:id` | Delete chat |
| `POST /ai-chat/:id/documents` | Attach document |
| `DELETE /ai-chat/:id/documents/:docId` | Remove document |
| `POST /ai/generate-from-file` | Generate quiz/flashcards from PDF |
| `GET /ai/recent-uploads` | PDF upload history |
| `GET /examattempts/history-stats` | Stats |
| `GET /examattempts/list` | Exam history |

## Files to Create

### iOS (`iosApp/ExamioApp/Features/AI/`)

| File | Purpose |
|------|---------|
| `AITabView.swift` | Tab root with segmented control (Teacher/Tool/History) |
| `AIChatListView.swift` | Chat list sidebar/sheet |
| `AIChatView.swift` | Chat conversation view |
| `AIChatViewModel.swift` | Chat state, message streaming |
| `ChatMessageBubble.swift` | Message bubble (user/assistant) |
| `SubjectPickerView.swift` | Subject selection for new chat |
| `AIToolView.swift` | PDF upload + generation config |
| `AIToolViewModel.swift` | Upload state, generation progress |
| `HistoryTabView.swift` | Tabbed history (PDF / Exam) |
| `HistoryViewModel.swift` | History data loading |
| `PDFHistoryRow.swift` | PDF history item row |
| `ExamHistoryRow.swift` | Exam history item row |

### Android (`androidApp/src/main/kotlin/com/examio/app/features/ai/`)

| File | Purpose |
|------|---------|
| `AINavGraph.kt` | Navigation graph for AI tab |
| `AITabScreen.kt` | Tab root with top tabs |
| `AIChatListScreen.kt` | Chat list |
| `AIChatScreen.kt` | Chat conversation |
| `AIChatViewModel.kt` | Chat state, streaming |
| `ChatMessageBubble.kt` | Message bubble composable |
| `SubjectPicker.kt` | Subject selection dialog |
| `AIToolScreen.kt` | PDF upload + config |
| `AIToolViewModel.kt` | Upload state, generation |
| `HistoryScreen.kt` | Tabbed history |
| `HistoryViewModel.kt` | History data |
| `PDFHistoryItem.kt` | PDF history item |
| `ExamHistoryItem.kt` | Exam history item |

### Files to Modify

| File | Change |
|------|--------|
| `iosApp/ExamioApp/Views/AiView.swift` | Replace with AITabView |
| `androidApp/.../features/ai/AiScreen.kt` | Replace with AINavGraph entry |

## Implementation Steps

### AI Teacher (Chat)
1. Create `AIChatViewModel` consuming `AIChatRepository`
2. Chat list: load chats, show title + last message + date
3. Create new chat: optional subject selection from subjects API
4. Chat view: display messages as bubbles (user right, assistant left)
5. Message input: text field + send button + image attach + document attach
6. **SSE streaming**: use platform SSE client to stream assistant response
   - On each chunk: append to current assistant message bubble
   - On done: finalize message, update chat title if new
   - On error: show error inline
7. Markdown rendering in assistant messages (basic: bold, italic, code, lists)
8. Delete chat, clear chat actions

### AI Tool (Generator)
9. File picker for PDF selection (system document picker)
10. Configuration: quantity (quiz/flashcard), type (quiz/flashcard/both), narrow search toggle + keyword
11. Submit: multipart upload via `POST /ai/generate-from-file`
12. Show job status (pending/processing) — poll or navigate to history
13. Display wallet balance deduction feedback

### History
14. Two-tab layout: PDF History | Exam History
15. PDF history: filename, date, status badge, quiz/flashcard counts
16. Exam history: exam title, score, date, status
17. Pagination for both lists

## Data Flow — SSE Streaming

```
AIChatView -> AIChatViewModel.sendMessage(chatId, text)
  -> AIChatRepository.streamMessage(chatId, request)
    -> SSEClient.connect(url, body)
      <- event: user_message -> add user bubble
      <- event: chunk -> append to assistant bubble (streaming)
      <- event: done -> finalize assistant message
      <- event: error -> show error
  -> UI updates reactively as chunks arrive
```

## SSE Implementation Detail

```kotlin
// shared/commonMain - expect declaration
expect class SSEClient {
    fun stream(
        url: String,
        body: String,
        headers: Map<String, String>,
        onEvent: (type: String, data: String) -> Unit,
        onError: (String) -> Unit,
        onComplete: () -> Unit
    ): Cancellable
}
```

- iOS actual: `URLSession` with `dataTask` reading chunked response
- Android actual: `OkHttp` with streaming response body

## Success Criteria

- [ ] Chat list shows all user chats with last message preview
- [ ] New chat creation with optional subject
- [ ] Messages stream in real-time (character by character appearance)
- [ ] Markdown rendered in assistant messages
- [ ] Image/document attachment works
- [ ] AI Tool: PDF upload triggers generation job
- [ ] AI Tool: shows balance deduction
- [ ] History: PDF list with status badges
- [ ] History: Exam list with scores
- [ ] Both history lists paginate

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| SSE streaming reliability on mobile | Implement reconnection logic; show "reconnecting" state |
| Large chat history performance | Paginate messages; load last 50, load more on scroll up |
| PDF upload size limits | Check file size before upload; show error if too large |
| Markdown rendering complexity | Use lightweight markdown lib (Down for iOS, Markwon for Android) |

## Rollback

Revert AiView/AiScreen to placeholder. AI-specific files are additive.
