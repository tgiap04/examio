# [CLAUDE.md](http://CLAUDE.md)

Tệp này cung cấp hướng dẫn cho Claude Code (claude.ai/code) khi làm việc với mã nguồn trong repository này.

## Cấu trúc repository

- Repository này được chia thành ba workspace chính:
  - `examio-be/`: repository backend polyglot gồm các microservice NestJS và một AI service viết bằng Python.
  - `examio-fe/`: frontend React 19 + Vite.
  - `examio-app/`: mobile app Kotlin Multiplatform (Android Jetpack Compose + iOS SwiftUI), dùng chung business logic/networking qua module `shared/`. Gọi lại API hiện có của backend, không có backend riêng cho mobile. Xem `examio-app/user-stories.md` cho phạm vi tính năng.
- Hãy xem backend, frontend và mobile app là ba package root riêng biệt. Chạy lệnh trong đúng thư mục con thay vì ở thư mục gốc repository.
- Không có package manager workspace dùng chung ở thư mục gốc cho các app.
- **[QUAN TRỌNG]** Khi sửa UI trên mobile thì cần sửa cả `iosApp` và `androidApp` trong `examio-app/` để đảm bảo feature parity (đã ghi trong CLAUDE.md § Note ở cuối file).

## Các tệp hướng dẫn hiện có

- `AGENTS.md` đã tồn tại ở thư mục gốc repo và đã ghi lại các convention quan trọng, riêng cho repo này. Hãy đọc nó trước khi thực hiện thay đổi lớn.
- Không có `CLAUDE.md` nào trước đó khi tệp này được tạo.
- Không tìm thấy Cursor rules trong `.cursor/rules/` hoặc `.cursorrules`.
- Không tìm thấy Copilot instructions trong `.github/copilot-instructions.md`.

## Các lệnh thường dùng

### Backend (`examio-be`)

```bash
cd examio-be
yarn install
yarn build
yarn test
yarn test:watch
yarn test:cov
yarn test:debug
yarn dev:auth
yarn dev:exam
yarn dev:finance
yarn dev:gateway
yarn dev:r2
yarn dev:admin
yarn dev:ai
yarn dev:all
yarn prisma:merge
yarn prisma:generate
yarn prisma:migrate
yarn prisma:studio
yarn prisma:deploy
yarn prisma:seed
```

### Chạy một test backend cụ thể

```bash
cd examio-be
yarn test apps/auth-service/src/auth-service.controller.spec.ts
yarn test --testNamePattern="AuthServiceController"
yarn test --runInBand apps/exam-service/src/exam-service.controller.spec.ts
```

### Chạy e2e test backend trực tiếp

```bash
cd examio-be/apps/auth-service && ../../node_modules/.bin/jest --config test/jest-e2e.json
cd examio-be/apps/exam-service && ../../node_modules/.bin/jest --config test/jest-e2e.json
cd examio-be/apps/finance-service && ../../node_modules/.bin/jest --config test/jest-e2e.json
cd examio-be/apps/auth-service && ../../node_modules/.bin/jest --config test/jest-e2e.json test/app.e2e-spec.ts
```

### Frontend (`examio-fe`)

```bash
cd examio-fe
yarn install
yarn dev
yarn build
yarn start
yarn lint
yarn lint:fix
```

Ghi chú:

- Frontend dev server chạy trên port `5173` qua `vite --host 0.0.0.0 --port 5173`.
- Frontend hiện chưa có script test trong `package.json`.

### Python AI service (`examio-be/apps/ai-service`)

Script backend `yarn dev:ai` giả định rằng virtualenv đã tồn tại tại `examio-be/apps/ai-service/venv`.

```bash
cd examio-be/apps/ai-service
./venv/bin/uvicorn src.backend.main:app --reload --port 8000
./venv/bin/ruff check src
./venv/bin/black src
./venv/bin/isort src
```

Nếu `pytest` đã được cài trong môi trường local, có thể chạy một test riêng như sau:

```bash
cd examio-be/apps/ai-service
./venv/bin/pytest src/score/test_score_tool.py
```

## Hạ tầng local

- File docker compose dùng cho production/deploy của backend là `examio-be/deploy/docker-compose.yml`.
- Cấu hình compose đó bao gồm PostgreSQL, Redis, RabbitMQ, gateway, auth, exam, finance, r2, ai và một migration container.
- Backend hiện được thiết kế xoay quanh PostgreSQL + Redis + RabbitMQ cho persistence và messaging.
- `examio-be/docker-compose.example.yml` có tồn tại nhưng chỉ mô tả một service tối giản kiểu frontend và không phản ánh đầy đủ stack backend.

## Kiến trúc backend

### Topology các service

Backend là một root package dùng Yarn, tổ chức theo kiểu Nest monorepo với nhiều service nằm trong `examio-be/apps/`:

- `gateway-service`: điểm vào HTTP public và lớp façade/proxy.
- `auth-service`: xác thực, OAuth providers, quản lý profile/session/device và các gRPC endpoint liên quan auth.
- `exam-service`: domain chính cho thi cử và học tập.
- `finance-service`: ví, thanh toán, subscription và luồng khởi tạo ví theo event.
- `r2-service`: service lưu trữ tệp.
- `ai-service`: FastAPI service viết bằng Python cho RAG, OCR/xử lý tài liệu và các luồng AI chat/generation.

### Shared backend libraries

Mã hạ tầng dùng chung nằm trong `examio-be/libs/`:

- `@examio/common`: export các Nest module dùng chung, guards, auth helpers, mail/password/id services, event helpers, gRPC client helpers, utils và các file protobuf.
- `@examio/database`: Prisma schema/client và database module.
- `@examio/redis`: Redis module/service dùng chung.

Ưu tiên dùng các shared library này thay vì lặp lại code hạ tầng trong từng service.

### Mẫu giao tiếp giữa các service

Backend không phải là một monolith duy nhất dù các service dùng chung Prisma và shared libs.

- Gateway public các HTTP route và đẩy request xuống downstream service thông qua các proxy controller và `ProxyService`.
- Auth, finance và storage còn giao tiếp với nhau qua gRPC client/proto từ `@examio/common`.
- Các workflow bất đồng bộ giữa service dùng RabbitMQ qua shared events module.
- Ví dụ từ wiring hiện tại:
  - gateway biết URL của downstream service qua env như `AUTH_SERVICE_URL`, `EXAM_SERVICE_URL`, `FINANCE_SERVICE_URL`, `AI_SERVICE_URL`.
  - auth đăng ký wallet gRPC client.
  - exam đăng ký R2 client và import finance client module.
  - finance lắng nghe user event để tạo ví.
  - AI chat trong exam cũng đăng ký finance subscription gRPC client.

Khi thay đổi ranh giới giữa các service, hãy kiểm tra đồng thời HTTP proxy route, gRPC contract, event publisher/consumer và các service URL cấu hình qua env.

### Cách tổ chức domain bên trong service

Các Nest service chủ yếu đi theo cấu trúc feature-module, không phải chỉ là một cặp controller/service phẳng.

- `exam-service` là domain service lớn nhất. `ExamServiceModule` ghép nhiều module chức năng như quiz set, flashcard, exam room, exam session, exam attempt, cheating log, subject, AI generation, AI chat, statistics, student, finance client integration và R2 integration.
- `auth-service` ghép `AuthModule`, device management, profile handling, OAuth strategy, repository và một gRPC controller.
- `finance-service` ghép wallet module, SePay module và có user event handler để bootstrap ví.
- `gateway-service` được tổ chức thành nhiều proxy controller theo domain: auth, exam resources, AI/study, wallet/profile, R2, webhook, statistics và student.

Khi làm backend, hãy nghĩ theo feature module cộng với shared infra module, không chỉ theo từng file rời.

### Hình dạng dữ liệu

Prisma schema trong `examio-be/libs/database/src/schema.prisma` là nguồn sự thật dùng chung cho nhiều service.

Các domain quan trọng hiện đang được mô hình hóa ở đó gồm:

- User, verify/reset code, session, monthly upload quota, subscription.
- Wallet, wallet transaction và payment.
- Lưu trữ tệp người dùng (`UserStorage`), document chunk/OCR (`Document`) và các artifact phục vụ graph/RAG (`UserStorageGraph`, `UserStorageGraphGroup`).
- Nội dung học tập: quiz set, question, label, flashcard set, flashcard.
- Luồng đánh giá: exam room, exam session, exam attempt, cheating log, quiz practice attempt.
- AI chat: chat, message và liên kết chat-document.
- AI teacher taxonomy: subject category và subject với `systemPrompt` được lưu trong DB.

Vì Prisma được dùng chung, thay đổi schema thường kéo theo thay đổi ở nhiều service backend và cả type/API consumer phía frontend.

## Kiến trúc phần AI

- Python AI service là một FastAPI app riêng nằm trong `examio-be/apps/ai-service`.
- README của service này mô tả hai vai trò lớn:
  - pipeline RAG/truy xuất tài liệu.
  - orchestration kiểu ReAct agent/tool.
- Project Python phụ thuộc vào LangChain, LangGraph, Gemini integration, FAISS, Docling, OCR/document tooling và graph/community tooling.
- `exam-service` phía Nest không tự xử lý toàn bộ hành vi AI; nó còn đóng vai trò điều phối các request AI thông qua các module như `modules/ai` và `modules/ai-chat`, rồi gọi sang Python AI service qua HTTP.
- AI chat trong `exam-service` có liên kết với tài liệu và subscription:
  - chat record, message và document đính kèm được lưu trong Prisma.
  - AI chat module import `R2Module` cùng với finance gRPC client để kiểm tra subscription/package.
- Frontend có các API client riêng cho AI chat và virtual teacher flow, bao gồm cả xử lý streaming kiểu SSE trong `src/apis/aiChatApi.ts`.

Khi chỉnh sửa AI chat hoặc generation flow, hãy kiểm tra đủ ba lớp: frontend API/store/UI, `exam-service` điều phối, và Python AI service.

## Kiến trúc frontend

### Framework và cấu trúc app

- Frontend là một ứng dụng React 19 + Vite, bootstrap từ `examio-fe/src/main.tsx` và `examio-fe/src/App.tsx`.
- Routing dùng React Router, được khai báo trong `src/routes/index.tsx`.
- Protected route được chặn bởi route guards phía client như `ProtectedRoute` thay vì Next middleware.
- App được bọc bởi providers trong `src/provider/AppProviders.tsx`.

### Phân lớp frontend

Frontend được tổ chức quanh một số lớp khá ổn định:

- `src/pages`: page-level UI theo route.
- `src/apis`: các API client dựa trên Axios.
- `src/stores`: Zustand store cho state phía client.
- `src/components`: UI component.
- `src/hooks`, `src/lib`, `src/types`, `src/provider`: logic hỗ trợ.

Pattern phổ biến là:

1. route/page component render UI,
2. UI gọi Zustand store,
3. store gọi API wrapper trong `src/apis`,
4. API dùng Axios instance dùng chung từ `src/apis/api.ts`.

### Auth/session flow ở frontend

Auth không chỉ được xử lý bởi route guards phía client.

- `src/apis/api.ts` là nơi cấu hình Axios dùng chung, thêm bearer token từ `localStorage`, đồng thời gắn `X-Device-ID` để theo dõi session.
- File này cũng xử lý trường hợp `401` do session bị vô hiệu hóa bằng cách xóa auth state local và redirect về `/login`.
- `src/stores/useAuthStore.ts` là nơi quản lý auth state chính phía client cho login, signup, reset password, verify account, logout, OAuth redirect và cập nhật wallet balance.
- Nút login bằng OAuth redirect trực tiếp tới backend auth endpoint thông qua `NEXT_PUBLIC_API_URL`.

Nếu thay đổi hành vi auth, hãy cập nhật middleware, Axios behavior và Zustand auth store cùng nhau.

### Sự gắn kết giữa API và UI

- Frontend hiện gắn khá chặt với surface route của gateway/backend thông qua nhiều file API chuyên biệt (`authApi`, `examApi`, `aiChatApi`, `examSessionApi`, v.v.).
- Shared state cũng được chia theo feature (`useAuthStore`, `useExamSessionStore`, `useFlashcardSetStore`, `useStatsStore`, v.v.).
- Repository này ưu tiên các module API/store theo từng feature thay vì gom toàn bộ vào một abstraction API toàn cục.

Khi backend thay đổi response shape, hãy cập nhật đồng thời API client tương ứng, store liên quan và component đang sử dụng nó.

## Style code và convention đã được repo áp dụng

### Backend

- Dùng NestJS + TypeScript với dependency injection và nhiều decorator trong module/controller.
- Format backend theo `examio-be/.prettierrc.json`, và các file hiện tại thường dùng:
  - dấu chấm phẩy
  - nháy đơn
  - thụt lề 4 spaces
- Ưu tiên import shared lib như `@examio/common`, `@examio/database` và `@examio/redis`.
- Các pattern backend hiện có gồm repository cho Prisma access và pattern DTO với `nestjs-zod`/Zod ở một số module.

### Frontend

- TypeScript `strict` đang bật.
- Dùng alias `@/*` trong `tsconfig.json` thay vì relative path dài.
- ESLint được cấu hình bằng `@antfu/eslint-config` trong `examio-fe/eslint.config.mjs`.
- Các rule về sort import và consistent type-import đã được nới lỏng có chủ đích; không nên churn file chỉ để reorder import.
- Cảnh báo `unused-imports` đang bật.
- ESLint bỏ qua các thư mục UI kiểu generated/vendor:
  - `src/components/kokonutui`
  - `src/components/magicui`
  - `src/components/ui`
- File frontend hiện dùng nháy kép và thụt lề 2 spaces; hãy match style của file đang sửa.

### Python AI service

- Python target là `>=3.12,<4.0` trong `pyproject.toml`.
- Ruff bật `E`, `F`, `I`, `D`, `D401`, `T201`, `UP` cùng một số ignore như `E501`.
- Pydocstyle dùng convention Google.

## Gợi ý thực tế cho các phiên Claude sau

- Trước tiên hãy xác định task thuộc backend, frontend hay cả hai; nhiều tính năng user-facing đi xuyên qua cả hai repo.
- Với thay đổi backend, hãy kiểm tra xem hành vi liên quan có chạm tới gateway proxy, gRPC contract, RabbitMQ event, Prisma schema hoặc Python AI service hay không.
- Với thay đổi frontend, hãy tìm API wrapper và Zustand store tương ứng trước khi sửa UI component.
- Với tính năng AI/tài liệu, cần dự đoán trước sự liên kết giữa Prisma model, `exam-service`, `ai-service` và các client AI chat/generation phía frontend.
- Tránh chạy lệnh ở thư mục gốc repository trừ khi lệnh đó thực sự dành cho root; đa số lệnh phải chạy trong `examio-be/` hoặc `examio-fe/`.
- Giữ diff gọn và tập trung. Repo này có convention format/style khác nhau giữa backend và frontend, vì vậy hãy match theo file đang sửa.

## Active Technologies

- TypeScript 5.x with React 19 + React 19, React DOM 19, Axios, Zustand, Tailwind CSS 4, Radix UI primitives, TipTap, Framer Motion, Recharts, react-google-recaptcha-v3 (001-migrate-fe-vite)
- Browser localStorage, browser cookies for auth sync, backend APIs as system of record (001-migrate-fe-vite)

## Quy tắc Tối ưu Hiệu năng (Performance Rules)

### Nguyên tắc Độ phức tạp Thuật toán

- **Ưu tiên O(1), O(log n)** - Không dùng O(n) hoặc cao hơn khi có thể
- **Tuyệt đối không N+1 query** - Luôn dùng `include`/`join` để fetch related data trong 1 query
- **Batch operations** - Xử lý nhiều records trong 1 câu query thay vì loop từng cái

### Database & Query Optimization

```typescript
// ✅ ĐÚNG: Dùng include để tránh N+1
const users = await prisma.user.findMany({
  include: { posts: true, profile: true }
});

// ❌ SAI: N+1 query trong loop
const users = await prisma.user.findMany();
for (const user of users) {
  user.posts = await prisma.post.findMany({ where: { userId: user.id } }); // N+1!
}
```

- Dùng `select` thay vì `include` khi chỉ cần vài fields
- Dùng `cursor`/`skip`/`take` cho pagination thay vì `offset` khi có nhiều records
- Index các fields thường dùng trong WHERE, ORDER BY

### Memory Management

- **Không leak memory** - Cleanup event listeners, subscriptions, timers
- **Stream large data** - Dùng cursor/streaming thay vì load toàn bộ vào memory
- **Limit response size** - Pagination, field selection, truncate long text
- **Dispose resources** - Close connections, clear caches khi không cần

### Python AI Service (FastAPI)

```python
# ✅ ĐÚNG: Dùng async và batch
embeddings = await ollama_embeddings.create_embeddings_batch(texts, batch_size=10)

# ❌ SAI: Loop sync trong async function
for text in texts:
    result.append(await ollama_embeddings.create_embedding(text))  # Chậm!
```

- Dùng `async/await` cho I/O operations
- Dùng `concurrent.futures` hoặc `asyncio` cho parallel processing
- Cache embedding results nếu text giống nhau
- Giới hạn batch size và concurrency để tránh OOM

### Frontend Performance

- **Memo components** - Dùng `React.memo`, `useMemo`, `useCallback` cho expensive computations
- **Virtual scrolling** - Cho danh sách dài (&gt;100 items)
- **Code splitting** - Lazy load routes/components không cần thiết
- **Debounce/Throttle** - Input events, scroll handlers, resize observers
- **Zustand / Data call from api** - Cần cache kết quả API để tránh gọi lại quá nhiều, khi chuyển qua lại các trang cùng một phiên không cần gọi lại API, trừ khi thực hiện các action Create/Update/Delete data thì mới cần, hoặc load lại trang thì sẽ cần
- Khi sửa UI trên mobile thì cần sửa cả ios app (iosApp) và android app (androidApp) luôn nhé

### Monitoring & Testing

- Dùng `EXPLAIN ANALYZE` (PostgreSQL) để kiểm tra query plans
- Track N+1 queries bằng Prisma middleware hoặc query logging
- Benchmark trước/sau khi thay đổi quan trọng

### Note

- Tuyệt dối không commit code lên nếu người dùng không cho phép
- Tuyệt đối không sinh plan trong examio-fe hay examio-be hay examio-app mà sinh trong `/plans`
- Khi xóa bản ghi ( data ) ở database mà nó có ảnh lưu ở R2 thì đảm bảo cũng xóa luôna nhr đó trên R2

---

## Recent Changes

- 001-migrate-fe-vite: Added TypeScript 5.x with React 19 + React 19, React DOM 19, Axios, Zustand, Tailwind CSS 4, Radix UI primitives, TipTap, Framer Motion, Recharts, react-google-recaptcha-v3

## Git commit rules

### Commit với tên là `Claude`, claude là co author trailẻ, còn tôi là author chính, không push nếu không được sự cho phép, chỉ commit

### Quy tắc gen message commit:

## Commit Message Formats

### General Commit

```
<type>(<optional scope>): <description>empty line as separator<optional body>empty line as separator<optional footer>
```

### Initial Commit

```
chore: init
```

### Merge Commit

```
Merge branch '<branch name>'
```

Follows default git merge message

### Revert Commit

```
Revert "<reverted commit subject line>"
```

Follows default git revert message

### Types

- Changes relevant to the API or UI:
  - `feat` Commits that add, adjust or remove a feature to/of/from the API or UI
  - `fix` Commits that fix an API or UI bug of a preceded `feat` commit
- `refactor` Commits that rewrite or restructure code without altering API or UI behavior
  - `perf` Commits are special type of `refactor` commits that specifically improve performance
- `style` Commits that address code style (e.g., white-space, formatting, missing semi-colons) and do not affect application behavior
- `test` Commits that add missing tests or correct existing ones
- `docs` Commits that exclusively affect documentation
- `build` Commits that affect build-related components such as build tools, dependencies, project version, ...
- `ops` Commits that affect operational aspects like infrastructure (IaC), deployment scripts, CI/CD pipelines, backups, monitoring, or recovery procedures, ...
- `chore` Commits that represent tasks like initial commit, modifying `.gitignore`, ...

### Scopes

The `scope` provides additional contextual information.

- The scope is an **optional** part
- Allowed scopes vary and are typically defined by the specific project
- **Do not** use issue identifiers as scopes

### Breaking Changes Indicator

- A commit that introduce breaking changes **must** be indicated by an `!` before the `:` in the subject line e.g. `feat(api)!: remove status endpoint`
- Breaking changes **should** be described in the [commit footer section](#footer), if the [commit description](#description) isn't sufficiently informative

### Description

The `description` contains a concise description of the change.

- The description is a **mandatory** part
- Use the imperative, present tense: "change" not "changed" nor "changes"
  - Think of `This commit will...` or `This commit should...`
- **Do not** capitalize the first letter
- **Do not** end the description with a period (`.`)
- In case of breaking changes also see [breaking changes indicator](#breaking-changes-indicator)

### Body

The `body` should include the motivation for the change and contrast this with previous behavior.

- The body is an **optional** part
- Use the imperative, present tense: "change" not "changed" nor "changes"

### Footer

The `footer` should contain issue references and informations about **Breaking Changes**

- The footer is an **optional** part, except if the commit introduce breaking changes
- *Optionally* reference issue identifiers (e.g., `Closes #123`, `Fixes JIRA-456`)
- **Breaking Changes** **must** start with the word `BREAKING CHANGE:`
  - For a single line description just add a space after `BREAKING CHANGE:`
  - For a multi line description add two new lines after `BREAKING CHANGE:`

### Versioning

- **If** your next release contains commit with...
  - **Breaking Changes** incremented the **major version**
  - **API relevant changes** (`feat` or `fix`) incremented the **minor version**
- **Else** increment the **patch version**

### Examples

- 

```
feat: add email notifications on new direct messages
```

- 

```
feat(shopping cart): add the amazing button
```

- 

```
feat!: remove ticket list endpoint

refers to JIRA-1337

BREAKING CHANGE: ticket endpoints no longer supports list all entities.
```

- 

```
fix(shopping-cart): prevent order an empty shopping cart
```

- 

```
fix(api): fix wrong calculation of request body checksum
```

- 

```
fix: add missing parameter to service call

The error occurred due to <reasons>.
```

- 

```
perf: decrease memory footprint for determine unique visitors by using HyperLogLog
```

- 

```
build: update dependencies
```

- 

```
build(release): bump version to 1.0.0
```

- 

```
refactor: implement fibonacci number calculation as recursion
```

- 

```
style: remove empty line
```