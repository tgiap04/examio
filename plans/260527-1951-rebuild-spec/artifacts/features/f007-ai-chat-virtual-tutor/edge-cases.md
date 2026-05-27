# F007 Edge Cases - AI Chat & Virtual Tutor

| Scenario | What Happens | User-Facing Message |
|---|---|---|
| User is not signed in | Workspace/API blocks chat. | Please sign in to use AI tutor. |
| SSE stream disconnects | Preserve sent user message and show retry state. | Connection lost. Try sending again. |
| Mobile starts streaming chat | Platform SSE actuals are stubbed. | AI streaming is not available on this device yet. |
| Attached document is not processed | Chat should reject or warn before sending context. | This document is not ready yet. |
| User attaches a document they do not own | Backend should reject access. | You do not have access to this document. |
| Subject list fails to load | Chat can continue without subject if allowed. | Subjects could not be loaded. |
| Knowledge user lacks permission | GenAI knowledge action is blocked. | You do not have permission to manage tutor knowledge. |
| Python AI service is unavailable | Chat/generation fails gracefully. | AI tutor is temporarily unavailable. |
