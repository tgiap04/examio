# Blueprint — Sinh từ con từ một từ gốc cụ thể (Word Family detail page)

**Route:** `/k/word-family/:slug/:rootWord` (vd `/k/word-family/shopping-restaurant/order`)
**Discipline:** Auto · **Commit:** KHÔNG (chờ user cho phép)

## Status
✅ Phase 1 (AI service) — Done  
✅ Phase 2 (exam-service) — Done  
✅ Phase 3 (gateway-service) — Done  
✅ Phase 4 (Frontend) — Done  
✅ Phase 5 (Temper/Inspect) — Done  

## Fix round (2026-07-17, sau phản hồi user)
3 lỗi user báo → root cause:
1. **Timeout**: gateway `forwardWithAuth` (default timeout) nhưng exam-service `await` AI call (600s) → client/proxy timeout trước khi AI xong. → **Fix**: exam-service chạy AI ở **background** (`runRootGeneration`, không await), trả `{generating:true}` ngay; FE poll trạng thái rồi refetch khi lock clear.
2. **UI không hiện data**: `getWordFamily` trả nguyên record (words nằm trong `.data`), FE đọc `.words` top-level. → **Fix**: `getWordFamily` flatten `{id, rootWord, categorySlug, words, createdAt, updatedAt}`.
3. **"DB chưa lưu"**: thực ra CÓ lưu (row `order` updatedAt hôm nay, 7 words) nhưng lưu SAU khi client đã timeout → user thấy data cũ. → background flow đảm bảo server hoàn tất bất kể client.

**Thiết kế lock/status (đã chốt sau review):** dùng lock **root-specific** `wf:gen:lock:${userId}:${categorySlug}:${rootWord}` + endpoint mới `GET generation-status/:slug/:rootWord`, ĐỘC LẬP hoàn toàn với luồng category-level (`generate` + `generation-status/:slug`). Lý do: reuse lock category-level (bản nháp đầu) gây cross-flow bleed — trang detail hiện banner/toast "đã sinh" sai cho từ gốc không liên quan, và mất khả năng sinh song song nhiều từ gốc.

FE: state root-scoped `regeneratingKey` (=`${categorySlug}:${rootWord}`) + `checkRootGenerationStatus`/`abandonRootGeneration`; trang detail poll theo `regeneratingKey`. Giữ `activeDetailKey` guard chống race khi điều hướng.

## Follow-ups (logged, ngoài scope task này)
- Category `generateWordFamily` vẫn `await` AI đồng bộ (cùng lớp lỗi timeout) — nên background hoá tương tự (ticket riêng).
- FE abandon timer nên tính elapsed từ `startedAt` server trả về (thay vì reset 0 mỗi lần mount).
- Test hygiene: capture/await promise `runRootGeneration` trong spec để tránh console noise từ detached promise.
- File-size >200 dòng: `word-family.service.ts`, `WordFamilyDetailPage.tsx`, `useWordFamilyStore.ts` — tách khi đụng lần sau.

## Vấn đề
Tính năng sinh word family hiện chỉ chạy ở **category level** (`POST /word-family/generate`) — AI tự chọn N từ gốc NGẪU NHIÊN. Chưa có cách sinh các **từ con cho một từ gốc CỤ THỂ** mà user đang xem. Trang detail hiện chỉ hiển thị family đã có.

## Giải pháp
Thêm luồng "sinh từ con cho từ gốc = param URL", đồng bộ, ghi đè (upsert) bản ghi hiện tại. Xuyên 5 lớp:

### Phase 1 — AI service (Python)
- `services/generation_service.py`:
  - `WordFamilyRequest`: thêm `root_word: Optional[str] = None`.
  - `_build_word_family_prompt`: nếu có `root_word` → prompt "sinh word family variations cho ĐÚNG từ gốc này" (giữ nguyên JSON schema, `rootWord` = từ đã cho, 5-8 biến thể).
  - `generate_word_family`: truyền `root_word` vào prompt; trong parse, nếu có `root_word` → ép `parsed.rootWord = request.root_word` (verbatim) để khớp unique key.
- `api/generation.py`: `GenerateWordFamilyBody` thêm `rootWord: Optional[str]`, truyền xuống `WordFamilyRequest`.

### Phase 2 — exam-service (NestJS)
- `interfaces/word-family.interface.ts`: `AiWordFamilyRequest` thêm `rootWord?: string`.
- `dto/word-family.dto.ts`: thêm `GenerateRootWordFamilySchema { categorySlug, rootWord }` + `GenerateRootWordFamilyDto`.
- `word-family.service.ts`: thêm `generateWordFamilyForRoot(user, dto)`:
  - lock key `wf:gen:lock:${userId}:${categorySlug}:${rootWord}` (NX, TTL 30m).
  - payload gồm `rootWord`, gọi `POST {AI}/generate/word-family`.
  - `repository.createWordFamily({ rootWord: dto.rootWord, ... })` (đã upsert → overwrite) — ép rootWord = dto.rootWord.
  - trả về `saved`.
- `word-family.controller.ts`: `@Post('generate-root')` (AuthGuard) → `service.generateWordFamilyForRoot(req.user, dto)`.

### Phase 3 — gateway-service
- `word-family-proxy.controller.ts`: `@Post('generate-root')` → forward `POST /api/v1/word-family/generate-root`.

### Phase 4 — Frontend
- `apis/wordFamilyApi.ts`: `GenerateRootWordFamilyBody { categorySlug, rootWord }` + `generateWordFamilyForRootApi(body): Promise<WordFamilyRecord>` → `POST /word-family/generate-root`.
- `stores/useWordFamilyStore.ts`: state `regeneratingRoot: string | null` + action `generateWordFamilyForRoot(categorySlug, rootWord)`:
  - POST → invalidate `wf:detail:${slug}:${rootWord}` + `wf:roots:${slug}` → `fetchWordFamily(slug, rootWord, true)` (tái dùng code path hiển thị, tránh mismatch shape) → return bool.
- `pages/k/WordFamilyDetailPage.tsx`:
  - Nút header "Sinh lại từ con" (icon reload) khi đã có từ; empty-state hiện nút lớn "Sinh từ con cho '<root>'".
  - loading theo `regeneratingRoot === rootWord`; toast success/error.

### Phase 5 — Temper + Inspect
- `tester`: unit test cho `generate_word_family` (nhánh root_word), `word-family.service.spec.ts` (generateWordFamilyForRoot: lock, upsert, override rootWord).
- `reviewer`: review toàn bộ diff.

## Files
**Modify:** ai-service generation_service.py, generation.py · exam word-family.service.ts, controller.ts, dto, interface · gateway word-family-proxy.controller.ts · fe wordFamilyApi.ts, useWordFamilyStore.ts, WordFamilyDetailPage.tsx

## Success criteria
- Nhấn nút trên `.../order` → sinh & ghi đè word family cho "order", trang refresh hiển thị từ con mới.
- Không phá luồng category generate hiện có. Compile sạch cả BE + FE.

## Risk
- AI trả rootWord lệch case → ép verbatim ở Python + exam service (dùng dto.rootWord cho upsert).
- Request đồng bộ chờ AI (timeout BE 600s) → 1 root word sinh nhanh; nút loading; chấp nhận được.

## Completion Status
**Fix round complete** (3 user bugs resolved; see §Fix round above).  
**Design finalized:** root-specific lock `wf:gen:lock:${userId}:${categorySlug}:${rootWord}` + background-job flow (`runRootGeneration` async, no await) + detail-page poll via `generation-status/:slug/:rootWord` endpoint.  
**Build & test:** FE tsc clean, exam-service + gateway-service nest build clean, 19/19 unit tests pass (word-family.service.spec.ts).  
**Review:** 8/10 (prior HIGH bug resolved, 0 critical/0 high). Follow-ups (category-level sync, timer hygiene, file split) logged in §Follow-ups, ngoài scope.
