# AGENTS.md

## Phạm vi áp dụng

- Tệp này áp dụng cho thư mục gốc của repository: `examio/`.
- Repository được chia thành 2 ứng dụng chính:
  - `examio-be/`: monorepo NestJS và dịch vụ AI viết bằng Python.
  - `examio-fe/`: frontend Next.js 15 dùng TypeScript, Tailwind, Zustand và Axios.
- Không có `AGENTS.md` ở thư mục gốc trước đó cần giữ lại.
- Không tìm thấy Cursor rules trong `.cursor/rules/` hoặc `.cursorrules`.
- Không tìm thấy Copilot instructions trong `.github/copilot-instructions.md`.

## Cách tiếp cận khi làm việc

- Xem backend và frontend là 2 workspace riêng, mỗi bên có `package.json` riêng.
- Ưu tiên thay đổi nhỏ nhất có thể và phù hợp với convention hiện có.
- Không giả định có package manager workspace chung ở thư mục gốc cho cả 2 app.
- Chạy lệnh trong đúng thư mục con, trừ khi lệnh đó yêu cầu đường dẫn khác rõ ràng.
- Giữ nguyên nội dung giao diện tiếng Việt nếu khu vực xung quanh đang dùng tiếng Việt.

## Cấu trúc repository

- `examio-be/apps/auth-service`: dịch vụ xác thực NestJS.
- `examio-be/apps/exam-service`: dịch vụ miền nghiệp vụ bài thi/exam NestJS.
- `examio-be/apps/finance-service`: dịch vụ tài chính NestJS.
- `examio-be/apps/gateway-service`: HTTP gateway NestJS.
- `examio-be/apps/r2-service`: dịch vụ tệp/R2 NestJS.
- `examio-be/apps/ocr-service`: dịch vụ OCR viết bằng TypeScript.
- `examio-be/apps/ai-service`: dịch vụ AI FastAPI viết bằng Python.
- `examio-be/libs/common`, `libs/database`, `libs/redis`: thư viện dùng chung cho backend.
- `examio-fe/src/app`: page và layout theo App Router của Next.js.
- `examio-fe/src/components`: các tầng UI (`atoms`, `molecules`, `organisms`, `ui`).
- `examio-fe/src/apis`, `src/stores`, `src/hooks`, `src/lib`, `src/types`: logic ứng dụng.

## Lệnh cài đặt

- Backend: `cd examio-be && pnpm install`
- Frontend: `cd examio-fe && pnpm install`
- Môi trường Python của AI service được quản lý bên trong `examio-be/apps/ai-service`.
- Script chạy local của AI service đang giả định có sẵn virtualenv tại `examio-be/apps/ai-service/venv`.
- Nếu thiếu `venv`, hãy tự tạo trước khi chạy các lệnh Python.

## Lệnh build và chạy

- Build toàn bộ backend: `cd examio-be && pnpm build`
- Chạy/dev từng Nest service riêng:
  - `cd examio-be && pnpm dev:auth`
  - `cd examio-be && pnpm dev:exam`
  - `cd examio-be && pnpm dev:finance`
  - `cd examio-be && pnpm dev:gateway`
  - `cd examio-be && pnpm dev:r2`
  - `cd examio-be && pnpm dev:ocr`
- Chạy đồng thời các service backend chính: `cd examio-be && pnpm dev:all`
- Chạy frontend dev server: `cd examio-fe && pnpm dev`
- Build frontend production: `cd examio-fe && pnpm build`
- Chạy frontend production: `cd examio-fe && pnpm start`
- Chạy AI service từ thư mục backend: `cd examio-be && pnpm dev:ai`
- Chạy OCR helper Python từ thư mục backend: `cd examio-be && pnpm dev:ocr-python`

## Lệnh lint và format

- Lint frontend: `cd examio-fe && pnpm lint`
- Tự động sửa lint frontend: `cd examio-fe && pnpm lint:fix`
- Backend có file cấu hình Prettier, nhưng không có script lint gốc trong `examio-be/package.json`.
- Format backend nhiều khả năng đang theo style tương thích Prettier; nếu cần chạy tay, chỉ format các file đã sửa.
- Python AI service khai báo `black`, `isort`, `pylint` và `ruff` trong `pyproject.toml`.
- Python AI service không có script chuẩn để lint/format; nếu cần, chạy trực tiếp trong `examio-be/apps/ai-service`.
- Các lệnh Python gợi ý:
  - `./venv/bin/ruff check src`
  - `./venv/bin/black src`
  - `./venv/bin/isort src`

## Lệnh test

- Unit test backend: `cd examio-be && pnpm test`
- Watch mode backend: `cd examio-be && pnpm test:watch`
- Coverage backend: `cd examio-be && pnpm test:cov`
- Debug test backend: `cd examio-be && pnpm test:debug`
- Frontend hiện chưa có script test trong `examio-fe/package.json`.
- Python AI service có một số file test-like, nhưng chưa có test runner chuẩn được cấu hình.

## Chạy một test cụ thể

- Chạy một file Jest backend: `cd examio-be && pnpm test -- apps/auth-service/src/auth-service.controller.spec.ts`
- Chạy Jest backend theo tên test/suite: `cd examio-be && pnpm test -- --testNamePattern="AuthServiceController"`
- Chạy một spec backend theo chế độ serial khi cần debug:
  - `cd examio-be && pnpm test -- --runInBand apps/exam-service/src/exam-service.controller.spec.ts`
- Ví dụ chạy e2e theo từng service:
  - `cd examio-be/apps/auth-service && ../../node_modules/.bin/jest --config test/jest-e2e.json`
  - `cd examio-be/apps/exam-service && ../../node_modules/.bin/jest --config test/jest-e2e.json`
  - `cd examio-be/apps/finance-service && ../../node_modules/.bin/jest --config test/jest-e2e.json`
- Ví dụ chạy một file e2e cụ thể:
  - `cd examio-be/apps/auth-service && ../../node_modules/.bin/jest --config test/jest-e2e.json test/app.e2e-spec.ts`
- Python AI service chưa chuẩn hóa cách chạy từng test, nhưng nếu có `pytest` trong local thì mẫu lệnh hợp lý là:
  - `cd examio-be/apps/ai-service && ./venv/bin/pytest src/score/test_score_tool.py`
- Frontend chưa có framework test, nên hiện không có hướng dẫn chạy single test cho frontend.

## Quy ước code backend

- Sử dụng TypeScript với decorator và dependency injection của NestJS.
- Tuân theo cấu hình Prettier trong `examio-be/.prettierrc.json`:
  - có dấu chấm phẩy
  - dùng nháy đơn
  - thụt lề 4 spaces
  - trailing comma kiểu `es5`
  - `printWidth` là `80`
- Ưu tiên alias cho shared libs: `@examio/common`, `@examio/database`, `@examio/redis`.
- Thứ tự import trên thực tế thường là:
  - import từ Nest/framework
  - import từ third-party
  - import từ shared library trong monorepo
  - import local DTO/repository/module
- DTO và schema nên đặt trong thư mục `dto/` riêng.
- Đã có sẵn pattern Zod + `createZodDto`; tiếp tục dùng pattern này thay vì đưa vào một kiểu validate khác trong cùng khu vực.
- Service class thường dùng hàm `async` và trả về plain object để controller response.
- Repository đóng gói truy vấn Prisma; ưu tiên tái sử dụng repository thay vì lặp lại logic truy cập dữ liệu.
- Nhiều nơi để TypeScript suy luận kiểu, nhưng DTO và tham số method có khai báo type rõ ràng vẫn là lựa chọn tốt.
- Dùng `PascalCase` cho class, DTO, module và interface đại diện cho contract có cấu trúc.
- Dùng `camelCase` cho method, biến và injected property.
- Tên file backend thường là kebab-case hoặc lowercase theo convention của Nest.

## Xử lý lỗi backend

- Ném các Nest HTTP exception phù hợp như `BadRequestException`, `NotFoundException`, `ConflictException`, `ForbiddenException`, `InternalServerErrorException`.
- Validate sớm và fail fast với ID thiếu, input rỗng, lỗi quyền truy cập, và trạng thái nghiệp vụ không hợp lệ.
- Trong service method, giữ nguyên các domain exception đã rõ ràng; với lỗi không xác định thì bọc lại bằng `InternalServerErrorException` khi phù hợp.
- Code hiện tại có dùng `console.log` và `console.error`; nếu có cải thiện logging thì vẫn cần nhất quán với file đang sửa.
- Không nuốt lỗi một cách im lặng, trừ khi đó là hành vi có chủ đích như publish event hoặc gửi mail theo kiểu fire-and-forget.

## Quy ước code frontend

- Sử dụng TypeScript với `strict` mode trong `examio-fe/tsconfig.json`.
- Dùng alias `@/*` thay cho đường dẫn relative dài.
- Frontend đang theo formatting dùng nháy kép và thụt lề 2 spaces; hãy match đúng style của file đang sửa.
- ESLint được cấu hình bởi `examio-fe/eslint.config.mjs` với `@antfu/eslint-config`.
- Một số rule sắp xếp import và type import đã chủ động tắt; không nên churn code chỉ để sắp xếp lại import.
- Rule `unused-imports` đang cảnh báo, vì vậy khi sửa file hãy xóa import thừa.
- Các thư mục UI sinh sẵn hoặc vendored đang bị bỏ qua bởi ESLint:
  - `src/components/kokonutui`
  - `src/components/magicui`
  - `src/components/ui`
- Ưu tiên convention App Router trong `src/app`.
- Client component cần khai báo rõ `"use client"` khi cần.
- Dùng store Zustand trong `src/stores` cho state chia sẻ phía client.
- Dùng các wrapper Axios trong `src/apis` thay vì gọi `fetch`/`axios` trực tiếp rải rác.
- Đặt helper dùng chung trong `src/lib` và shared domain types trong `src/types`.
- Component thường dùng `PascalCase`; hook và store thường theo mẫu `useXxx`.
- Tên utility function nên dùng `camelCase`.

## Quy ước UI và state frontend

- UI hiện tại kết hợp component tự viết, primitive kiểu shadcn, Radix và class Tailwind.
- Dùng `cn()` từ `@/lib/utils` để ghép class.
- Ưu tiên tái sử dụng các primitive có sẵn như button, card, dialog, select, toast trước khi tạo mới.
- Giữ nguyên các route group đã được tổ chức sẵn như `src/app/(auth)` và `src/app/(landing)`.
- Hành vi auth/session nên đi qua flow API/store sẵn có, không nên bypass.
- Code hiện tại thường redirect bằng `window.location.href`; không refactor pattern này nếu bài toán không bắt buộc.

## Quy ước cho Python AI service

- Python target trong `pyproject.toml` là `>=3.12,<4.0`, dù local `venv` có thể khác.
- Ruff đang bật các nhóm rule `E`, `F`, `I`, `D`, `D401`, `T201`, `UP` và có một số ignore.
- Pydocstyle đang theo convention Google.
- `E501` đang bị ignore, nên có thể có dòng dài; tránh reformat file không liên quan chỉ vì độ rộng dòng.
- Test được miễn một số rule về docstring và pyupgrade.
- FastAPI endpoint dùng model Pydantic và raise `HTTPException` khi request không hợp lệ.
- Ưu tiên logging cho lỗi server; giữ nguyên pattern logger cấp module nếu file đang theo cách đó.

## Ghi chú thực tế cho agent

- Trước khi sửa code, hãy xem cả `package.json` và các file lân cận vì convention giữa `examio-be` và `examio-fe` khác nhau.
- Khi thêm test, backend unit test nên đặt dạng `*.spec.ts`, còn e2e test nên đặt dạng `*.e2e-spec.ts`.
- Khi sửa hành vi của một Nest service, cần kiểm tra xem gateway liên quan, gRPC proto, hoặc Prisma repository có cần cập nhật theo không.
- Khi thay đổi shape API frontend, hãy cập nhật đồng bộ type, store và API wrapper liên quan.
- Tránh format cả repository; giữ diff gọn và tập trung vào phần đang sửa.
- Nếu thêm command mới hoặc workflow mới, hãy cập nhật lại file này để agent sau kế thừa được.
