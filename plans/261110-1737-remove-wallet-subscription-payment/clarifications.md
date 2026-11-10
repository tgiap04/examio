# Clarifications

## Session 2026-11-10
- Q: Remove wallet/subscription/payment at which level? → A: Remove entirely from code (finance-service, protos, DB tables/columns, Debit/Refund flows, FE wallet/subscription/payment and admin finance pages, infra/CI).
- Q: Usage limits after removing subscription packages? → A: No limits — drop every subscription/benefit-derived limit (ai-chat 5 msg/min + 30 msg/chat, document monthly file quota).
- Q: Who may use AI content generation? → A: Teachers only (ai:generate, word_family:generate stay TEACHER-only, as today).
- Q: Plan first or implement directly? → A: Plan first for user review; implement later on a branch off develop.
- Q: Web has no AI chat page; how do students get AI chat? → A: Not now — do not grant students AI chat in this plan.
- Q: Student permissions (ai_chat:use, document:upload)? → A: Keep student permissions unchanged; grant both together when an AI chat page is built later.
- Q: Two-release expand/contract migrations? → A: No — one release dropping money columns/tables directly (new stack never deployed to production; cutover resets the DB); proto removals use reserved.
- Q: Non-subscription technical limits (credential rate limit, max body size, 1 MB snapshot, vocabulary AI 20/day, access-code lockout, AI_BUSY)? → A: Keep (assumption from the original brief; not subscription-based).
