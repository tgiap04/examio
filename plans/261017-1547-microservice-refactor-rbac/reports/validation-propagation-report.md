# Validation Session 1 — Propagation Report (2026-10-18)

Source: `validation-session-1.md` (Action Items, Impact on Phases), `decisions.md` 2026-10-18. Marker: `<!-- Updated: Validation Session 1 - <change> -->`. plan.md not edited.

## Changes per file
- **P01**: ai-service legacy deletion added (grep-verified): `src/score/` (incl. `test_score_tool.py`), dev agent `src/agent/` + its only consumers `src/evaluate_chatbot.py`, `src/streamlit_ui/` (not deployed, not imported by `src/backend`/`src/evaluation`), `benchmark_index_service.py` (no HTTP route exists; importers = lifespan `main.py:58-65` + `evaluation/scripts/seed_benchmark_index.py`), `libs/database/src/models/benchmark-item.prisma`; `pyproject.toml` packages, READMEs. Ownership, steps, todo, success grep, risk. Backup note → P16 runbook.
- **P03**: old-queue cleanup → local `down -v` / cutover volume drop.
- **P04**: catalog TEACHER += `word_family:save` (permissions.ts + snapshot test); no `isAdmin` alias, `wallet` left as today until P10; demotion requirement (only `role`/`authzVersion` change, content/ownership untouched, no block on open sessions) + e2e; "deploy together" / Milestone A → local-compose verification; RT-13 noted as reversed.
- **P05**: deploy wording → local compose / P16 cutover (real-IP prod check moved to cutover smoke, rollback); new `rateLimits` row `word-family-generate` 5/min (needed for "gateway rate-limited").
- **P06**: owner-role-independence requirement for all student access checks; new `demoted-owner.ownership.e2e-spec.ts` (title = required phrase) + static grep; matrix TEACHER `GET /word-family/saved` 403 → 200; table rows (save STUDENT+TEACHER, generate free + gateway limit); "open product question" → resolved; Milestone A wording.
- **P07**: Milestone A wording; quiz rows appended to the P06 demoted-owner spec.
- **P08**: demotion dialog copy "Nội dung đã tạo được giữ nguyên nhưng bị khoá quản lý; học sinh đã được chia sẻ vẫn học được. Số dư ví được giữ nguyên."; e2e + manual demotion checks; deploy wording.
- **P09**: no `isAdmin` in FE type (no compat tolerance); `wallet?` stays until P10; generated type carries TEACHER `word_family:save`; "Lưu/Từ đã lưu" for both roles + test.
- **P10**: `/auth/me` drops `wallet`/`subscription` outright, no `GetWallet` compat call; FE balance via `GET /wallet/info`; tests/todo/success/next steps; wave wording.
- **P11**: `BenchmarkItem` / benchmark DDL removed; prod reset → P16 runbook.
- **P12**: save = STUDENT+TEACHER; generation free, TEACHER-only, gateway rate-limited; e2e TEACHER save → 201, generate writes no wallet tx.
- **P15**: all score/BenchmarkItem/benchmark-reload items removed (insights, schema list, delete list, steps, todo, risk).
- **P16**: Overview statement (single production deploy); new section "Production cutover runbook (one-time, at final merge)" (preconditions + `CUTOVER_DONE` deploy gate, pg_dump kept off-host, drain/stop, drop postgres/redis/rabbitmq volumes, new R2 bucket, render definitions, per-service migrate in waves, prod-only seed via `ROLE=seed`, bootstrap admin via auth CLI, smoke script, rollback = `:pre-cutover` images + dump restore + old bucket); files `deploy/cutover-runbook.md`, `scripts/cutover-smoke.ts`; step 10, tests, todo, success, risks, rollback; waves = steady state after cutover.
- **P18**: rewritten for unreleased mobile: P2, depends on 09, gate = before first store release, no Milestone-A coupling, no legacy fallback/compat fields, release after cutover.
- **P19**: step 0 + compat text deleted; depends on 16 only; §14.2 Q3 resolved; §4.6 wording; cutover runbook summarised in `docs/system/architecture.md` + ARCH §10.3 note (link, no duplicated commands); changelog = one cutover release entry.
- **reports/planner-brief.md §5**: one-line note (TEACHER += `word_family:save`).

## New efforts (phase files)
| Phase | Old | New | Why |
|---|---|---|---|
| 01 | 2d | 2.25d | ai-service legacy + Prisma model deletion |
| 06 | 4.5d | 4.75d | demoted-owner spec + static check |
| 10 | 3d | 2.75d | no GetWallet compat path |
| 16 | 2d | 2.5d | cutover runbook + smoke script + rehearsal |
| 18 | 3d (prov.) | 2.75d (prov.) | no legacy fallback / coordinated release |
| 19 | 1.5d | 1.25d | step 0 removed |
Unchanged: 02–05, 07–09, 11–15. Phase-file total: **56.75d** (was 56.5d by files).

## Final sweep
Grepped all phases for `isAdmin` alias/deprecated/compat, `user.wallet` compat, `Milestone A` deploy, deploy/ship together, `BenchmarkItem`, `benchmark_index`, `score/`, TEACHER lacking `word_family:save`, "open product question". Left on purpose: P01 deletion targets; P02 interim `isAdmin → is_system_admin` mapping (pre-P04 rename); P04/P08 rename lines; P19 "milestones A–D" (roadmap grouping, not deploys).

## Unresolved contradictions
None in phase files. plan.md is out of sync (lead-owned, not edited):
1. Phase table efforts: 01 → 2.25d, 06 → 4.75d, 10 → 2.75d (plan says 2.5d, file said 3d), 16 → 2.5d, 18 → 2.75d (prov.), 19 → 1.25d; frontmatter `effort` 56d → 56.75d.
2. P19 "Depends on" `16, 18 released` → `16`.
3. RT table row 13 (`plan.md:77`) "Accept (compat fields; P18 ships with A)" → "Reversed by validation Q6 (mobile unreleased)". (Milestone/branching wording at `plan.md:48-52,89` is already consistent.)

Judgment calls to confirm (not contradictions): R2 = switch to a new bucket at cutover, old one emptied after the 24 h rollback window; P01 deletes the whole dev agent + streamlit UI (only consumers of `score/`); `ROLE=seed SEED_PROFILE=prod` replaces the deleted `Dockerfile.seed`.
