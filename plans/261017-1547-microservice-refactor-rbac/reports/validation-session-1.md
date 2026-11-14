### Session 1 — 2026-10-18
**Trigger:** `/create-plan --level max` mandatory post-red-team validation (verification pass skipped: Red Team findings already carried file:line evidence; no `[UNVERIFIED]` tags block decisions below).
**Questions asked:** 7

#### Questions & Answers

1. **[Business]** Khi giáo viên dùng AI sinh word family (từ vựng), có trừ credit không? Hiện tại miễn phí và ai cũng gọi được.
   - Options: Miễn phí + rate limit (Recommended) | Trừ credit
   - **Answer:** Miễn phí + rate limit
   - **Rationale:** No new money path in P12; `word_family:generate` stays TEACHER-only + gateway rate limit.

2. **[Business]** System admin hạ một giáo viên xuống học sinh. Nội dung họ đã tạo (quiz set, flashcard set, phòng thi, phiên thi đang mở) xử lý thế nào?
   - Options: Giữ nguyên, khoá quản lý (Recommended) | Chặn hạ nếu đang có phiên thi mở | Chuyển nội dung sang admin
   - **Answer:** Giữ nguyên, khoá quản lý
   - **Rationale:** Student access checks must never depend on the owner's current role; manage endpoints already require TEACHER permissions, so the demoted user gets 403 on management and nothing else changes.

3. **[Business]** Giáo viên có được lưu word family ("Từ đã lưu") như học sinh không? Danh mục hiện chỉ cho học sinh `word_family:save`.
   - Options: Có, thêm cho TEACHER (Recommended) | Không
   - **Answer:** Có, thêm cho TEACHER
   - **Rationale:** Catalog v1 change: TEACHER += `word_family:save`.

4. **[Process]** Chiến lược branch khi triển khai 19 phase?
   - Options: Branch theo milestone (Recommended) | Một branch dài | Branch theo phase
   - **Answer:** Một branch dài
   - **Rationale:** All work on `refactor/microservice-rbac`; one final merge. Needs a weekly rebase/merge of `main` and every phase green on the branch.

5. **[Process]** Với một branch dài, khi nào deploy production (kèm reset DB)?
   - Options: Chỉ một lần khi merge cuối (Recommended) | Staging theo milestone | Deploy production theo milestone
   - **Answer:** Chỉ một lần khi merge cuối
   - **Rationale:** Production keeps running the current build until the end. "Deploy together" constraints (04+05+08) apply to local/compose milestone testing only. Needs a one-time production cutover runbook (reset DB, per-service migrate, seed, bootstrap admin, smoke).

6. **[Integration]** App mobile (kmaedu-app) đã phát hành lên store và có người dùng thật chưa? Điều này quyết định P18 có chặn việc deploy backend hay không.
   - Options: Chưa phát hành | Đã có trên store
   - **Answer:** Chưa phát hành
   - **Rationale:** Reverses RT-13: no `isAdmin`/`wallet` compat fields needed; P18 no longer blocks any deploy, but must reach parity before the first mobile store release.

7. **[Scope]** ai-service còn `src/score/` … và `BenchmarkItem` … Sau khi reset DB xử lý thế nào?
   - Options: Xoá score/, seed lại benchmark (Recommended) | Giữ cả hai | Xoá cả hai
   - **Answer:** Xoá cả hai
   - **Rationale:** Delete `src/score/`, its dev agent, `benchmark_index_service.py`, its routes and the `BenchmarkItem` model in P01 cleanup; P15 no longer migrates them.

#### Confirmed Decisions
- Word-family generation: free, TEACHER-only, rate-limited.
- Demotion: content kept, management locked, student access unaffected.
- TEACHER gains `word_family:save`.
- Single long branch `refactor/microservice-rbac`, weekly sync with `main`.
- One production deploy at final merge with a DB reset + cutover runbook.
- Mobile unreleased: drop compat fields; P18 non-blocking, required before first store release.
- Remove ai-service score + benchmark entirely.

#### Action Items
- [ ] Catalog: TEACHER += `word_family:save` (P04 `permissions.ts`, P09 generated type, brief §5 note).
- [ ] Demotion rule + test (P04 role-change, P06 access checks independent of owner role, P08 UI copy).
- [ ] Remove compat-field work (P04, P09, P10, P18, P19 step 0); P18 deps 09, priority P2, gate = before first mobile release.
- [ ] Production cutover runbook (P16) + docs (P19); milestone deploy wording → local/compose (P04/P05/P08, plan.md).
- [ ] P01 deletes score/ + benchmark; P11/P15 drop BenchmarkItem references.

#### Impact on Phases
- P01: delete `apps/ai-service/src/score/`, dev agent importing it, benchmark service/routes, `BenchmarkItem` model.
- P04: catalog change; demotion keeps ownership; no compat fields in `/auth/me`.
- P06: shared/owner checks never read the owner's current role; e2e "demoted teacher's set still studyable by whitelisted student".
- P08: confirm dialog copy for demotion explains content is kept and locked.
- P09: permission type regenerated; drop compat tolerance.
- P10: wallet removed from `/auth/me` without compat.
- P11/P15: no BenchmarkItem.
- P16: one-time production cutover runbook; deploy waves apply after cutover.
- P18: depends on 09; P2; must finish before first store release; no Milestone-A coupling.
- P19: remove step 0 (compat removal).
