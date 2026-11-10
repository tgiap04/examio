# Decisions (authoritative — do not re-ask)

## Session 2026-10-17 — Architecture (from ARCHITECTURE.md §14.1)
- Q: Event broker? → A: Keep RabbitMQ; add outbox, DLQ, idempotent consumer, domain-event routing keys.
- Q: Deploy target? → A: Docker Compose on VPS, K8s-ready (per-service image, GHCR, per-service deploy).
- Q: Split exam-service? → A: Strong split: content, assessment, study-room, vocabulary, ai-chat.
- Q: Document/RAG data owner? → A: New document-service (UserStorage, quota); ai-service own DB `ai` (pgvector, Alembic).
- Q: Repo? → A: Keep monorepo `kmaedu-be`, boundaries via dependency-cruiser + per-service image.
- Q: Auth? → A: RS256 + JWKS, access 15m, revoke at gateway (Redis), public `/api/v1` paths unchanged.

## Session 2026-10-17 — Plan scope + RBAC
- Q: Plan scope? → A: HOLD — full P0–P8 roadmap + RBAC.
- Q: RBAC model? → A: Fixed roles + permission catalog in code; admin screen assigns roles, shows role→permission matrix read-only.
- Q: What can STUDENT do? → A: Nothing beyond learning: study only flashcard/quiz sets a teacher granted; take exams only in sessions the teacher allows.
- Q: Grey-zone features for STUDENT? → A: Allowed: join (not create) study rooms; view/save word families (no AI gen). Forbidden: AI chat/AI teacher, AI generation, wallet/payment/subscription, any content creation.
- Q: How does someone become TEACHER? → A: Default STUDENT on signup; TEACHER only when SYSTEM_ADMIN grants it (no request flow).
- Q: Grant mechanism teacher → student? → A: Reuse existing whitelist / invite code / public access (add to QuizSet where missing). No Class concept.
- Q: Existing users/data? → A: Reset DB (local now, production at deploy) — web has no real users. No data migration/backfill needed.
- Q: Multiple roles? → A: SYSTEM_ADMIN may combine with TEACHER; TEACHER and STUDENT are mutually exclusive. TEACHER can view/preview content they created (does not act as student for others' content).

## Session 2026-10-18 — Validation
- Q: Word-family AI generation charges credits? → A: No; free, TEACHER-only, rate-limited.
- Q: Demoted TEACHER→STUDENT content? → A: Keep content and ownership; management locked; students keep access.
- Q: TEACHER can save word families? → A: Yes; TEACHER += word_family:save.
- Q: Branch strategy? → A: One long branch refactor/microservice-rbac, single final merge.
- Q: When to deploy production? → A: Once, at final merge, with DB reset.
- Q: Mobile app released? → A: Not released; no compat fields; P18 must finish before first store release.
- Q: ai-service score/ and BenchmarkItem? → A: Delete both.
