# Phase 07 — Kiểm tra toàn bộ + soát sót

## Context Links
- [plan.md](plan.md)

## Overview
Ưu tiên cao. Thay đổi đụng contract, cấu hình, CI và deploy, nên chạy đủ các nhóm kiểm tra liên quan, rồi soát để không còn sót chữ cũ.

## Scope Contract
- **Changed:** toàn bộ đường dẫn và chữ; proto package; exchange; JWT iss/aud; DB; compose; CI; FE branding.
- **Impacted:** mọi service (import `@kmaedu/*`), gRPC giữa các service, event giữa Node và Python, boot của compose, CI.
- **Will verify:**
  - `yarn typecheck`, `yarn test` (đơn vị và authz), `check:ownership`, `check:deps`, `proto:lint`;
  - ai-service `pytest`;
  - FE `build` + `test`;
  - generator không lệch;
  - `docker compose config`;
  - be-e2e chạy local trên Docker với `.env` local tạm (không dùng `.env` remote);
  - CI trên PR.
- **Deliberately skipped:** `buf breaking`, vì đây là lần phá contract có chủ đích (label `proto:breaking`).

## Requirements — cổng soát sót
```bash
# nội dung (cả file nhị phân) — chỉ được còn thư mục plan này và changelog
git grep -il examio -- . ':!plans/261111-0007-rebrand-to-kmaedu' ':!docs/project-changelog.md'   # phải rỗng
git grep -c -i examio -- docs/project-changelog.md   # chỉ mục đổi tên
git ls-files | grep -i examio | grep -v '^plans/261111-0007-rebrand-to-kmaedu/'                  # phải rỗng
```
Nếu `.pkl` trong `graph_cache` còn chữ cũ: xóa khỏi git và thêm `src/storage/graph_cache/` vào `.gitignore` (đây là cache sinh lúc chạy).

## Implementation Steps
1. Export env local Docker (không bao giờ dùng `kmaedu-be/.env` hay `apps/*/.env`, vì chúng trỏ DB remote), dựng Postgres/Redis/RabbitMQ local.
2. `kmaedu-be`: `yarn typecheck && yarn test && yarn check:ownership && yarn check:deps && yarn proto:lint`.
3. Chạy fresh-DB `prisma migrate deploy` cho 8 service + ai `ROLE=migrate`, rồi chạy be-e2e như job CI.
4. `apps/ai-service`: `./venv/bin/pytest`. Venv tạo lại nếu cần; ở bước này đường dẫn máy chưa đổi.
5. `kmaedu-fe`: `yarn build && yarn test`.
6. `yarn gen:permissions-doc && yarn gen:fe-permissions`; `git diff --exit-code` trên các file sinh.
7. Cổng soát sót ở trên.
8. Lưu exit code thật vào `reports/tester-261111-rebrand.md`; bằng chứng ghi vào `evidence/`.

## Todo
- [x] Kiểm tra backend + e2e local
- [x] pytest ai-service
- [x] FE build/test
- [x] Generator không lệch
- [x] Cổng soát sót rỗng
- [x] Báo cáo tester

## Success Criteria
Mọi lệnh exit 0; cổng soát sót chỉ còn đúng ngoại lệ đã khai báo.

## Risk Assessment
Chuỗi bị ghép từ nhiều phần (ví dụ `'exam' + 'io'`) thoát khỏi grep. Kiểm tra boot service (be-boot / e2e) sẽ bắt được nếu đó là đường dẫn proto hoặc tên exchange.

## Security Considerations
Không in hay đọc `.env`; xem lại diff trước commit để chắc không có secret.

## Next Steps
Phase 08.
