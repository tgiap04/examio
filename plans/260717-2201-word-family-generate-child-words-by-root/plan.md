# Blueprint — Sinh từ con từ một từ gốc cụ thể (Word Family detail page)

**Route:** `/k/word-family/:slug/:rootWord` (vd `/k/word-family/shopping-restaurant/order`)
**Discipline:** Auto · **Commit:** KHÔNG (chờ user cho phép)

## Status
✅ Phase 1 (AI service) — Done  
✅ Phase 2 (exam-service) — Done  
✅ Phase 3 (gateway-service) — Done  
✅ Phase 4 (Frontend) — Done  
✅ Phase 5 (Temper/Inspect) — Done  

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
**Verification:** FE tsc clean, exam-service + gateway-service nest build clean, 17/17 unit tests pass (word-family.service.spec.ts).  
**Review score:** 7/10 (DONE_WITH_CONCERNS).  
**Concerns resolved:** High #1 (FE stale-write race) fixed via activeDetailKey guard in useWordFamilyStore. High #2 (per-user Redis lock on shared root resource) accepted tradeoff — kept for consistency with existing category-level generateWordFamily pattern. Low #5 (typed AI payload) fixed.
