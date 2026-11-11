# Phase 05 — Tài liệu: README gốc, CLAUDE.md, docker-development/README.md

## Context Links

- [plan.md](plan.md), báo cáo smoke của [phase-04](phase-04-smoke-e2e.md)
- `README.md` (mục "Cách 2 — Chế độ dev (hot reload)"), `CLAUDE.md` (mục "Hạ tầng local"), `docs/project-changelog.md`
- Mẫu giọng văn: `devt-docker-development/README.md`

## Overview

- 2h, files đã có (docker-development/README.md có mục "Giới hạn", README.md, CLAUDE.md, changelog); bước kiểm chạy thử chưa chứng minh. Thay hướng dẫn dev cũ (tự dựng hạ tầng, 11 file `.env`, `yarn dev:all`) bằng luồng `./project up`. Viết tiếng Việt theo `response-style-multilingual.md`: câu ngắn, ít từ tiếng Anh.

## Key Insights

- Luồng chạy trực tiếp trên máy (không Docker) vẫn có người dùng để debug một service: giữ lại ngắn gọn dưới tiêu đề "Chạy một service ngoài Docker", trỏ tới cổng hạ tầng `127.0.0.1` mà `./project up` đã mở.
- Số đo thật (thời gian `up` lần đầu, RAM full stack) lấy từ báo cáo phase 04, không ước lượng.

## Requirements

- `docker-development/README.md` (< 200 dòng): yêu cầu (Docker Desktop, Compose ≥ 2.24, RAM), bắt đầu nhanh, bảng lệnh, file `services` + bảng khóa → service + phụ thuộc tự kéo, `.env` (key nào bật tính năng nào), hai cổng và lý do, thông tin đăng nhập local (đường dẫn file secret), biến `KMAEDU_*`, test (`run-tests.sh`, `smoke-up.sh`), xử lý sự cố (cổng bận, watch không nhận → `KMAEDU_WATCH_POLL=true`, thiếu RAM, secret lệch volume → `db:reset`, lần đầu chậm).
- `README.md`: thay toàn bộ "Cách 2" bằng đoạn ngắn + link `docker-development/README.md`; bảng cổng HTTP/gRPC cũ chuyển vào mục "Chạy một service ngoài Docker".
- `CLAUDE.md` "Hạ tầng local": thêm một gạch đầu dòng về `docker-development/` (`./project up`, file `services`, overlay trên `deploy/compose`, không đọc `deploy/.env`, cổng 5173/8000, project `kmaedu-dev`).
- `docs/project-changelog.md`: một mục "Added".

## Architecture

Không áp dụng (chỉ tài liệu).

## Related Code Files

Tạo: `docker-development/README.md`. Sửa: `README.md`, `CLAUDE.md`, `docs/project-changelog.md`.

## Implementation Steps

1. Viết `docker-development/README.md` theo khung devt, điền số đo từ báo cáo smoke.
2. Sửa `README.md` mục "Cách 2" và "Yêu cầu" (Python/Node trên máy thành tùy chọn).
3. Thêm bullet vào `CLAUDE.md`.
4. Thêm mục changelog.
5. Kiểm mọi lệnh trong README chạy đúng như viết (copy-paste một lượt trên stack dev).

## Todo

- [x] docker-development/README.md
- [x] README.md
- [x] CLAUDE.md
- [x] docs/project-changelog.md
- [ ] chạy thử lệnh trong tài liệu — chưa chứng minh: không báo cáo nào ghi lần copy-paste README; smoke chỉ chạy `./project up/seed/down` qua script. Cần một lượt chạy tay.

## Success Criteria

- [ ] Người mới làm theo `README.md` → `docker-development/README.md` tới được trang đăng nhập và đăng nhập bằng admin seed mà không mở file nào khác — chưa có bằng chứng (smoke đăng nhập bằng API, không qua trình duyệt).
- [x] Không còn chỗ nào trong `README.md` bảo tự chép `apps/*/.env` để chạy dev (chỉ còn trong mục "Chạy một service ngoài Docker", đúng Key Insights).

## Risk Assessment

| Rủi ro | Khả năng | Ảnh hưởng | Đối sách |
|---|---|---|---|
| Tài liệu lệch hành vi | Trung bình | Thấp | bước 5 chạy lại lệnh |

## Security Considerations

- Tài liệu không chứa giá trị secret nào, chỉ tên key và đường dẫn file.

## Next Steps

Không commit trừ khi người dùng cho phép. Gợi ý commit: `feat(dev): add docker-development with ./project up` (phase 01–04) và `docs: document the docker-development flow` (phase 05), trên nhánh `feat/docker-development` tách từ `develop`.
