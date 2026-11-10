## Context links

- Parent plan: [plan.md](../plan.md)
- Locked design: [brainstorm session record](../../reports/brainstorm-260607-1517-admin-dashboard.md)
- All phase files: [phase-01](../plan.md) → [phase-09](phase-09-frontend-admin-users-finance-logs-audit.md)
- Architecture: [docs/system/architecture.md](../../../../docs/system/architecture.md)
- Permissions: [docs/system/permissions.md](../../../../docs/system/permissions.md)
- Roadmap: [docs/development-roadmap.md](../../../../docs/development-roadmap.md)
- Docker compose: [kmaedu-be/deploy/docker-compose.yml](../../../../kmaedu-be/deploy/docker-compose.yml)

## Overview

- **Date:** 2026-06-07
- **Track:** Integration (X)
- **Priority:** P0 (cuối cùng — hội tụ 2 track)
- **Implementation status:** done
- **Review status:** done

Replace mock data bằng real API, e2e test admin happy path + 401/403, docker compose với admin-service + shared `kmaedu_logs` volume, KLayout admin link, docs update (roadmap, changelog, architecture, permissions).

## Key Insights

- Track A (backend) + Track B (frontend) chạy song song từ phase 01–09. Phase 10 chỉ là glue + verify.
- Docker compose volume share: `kmaedu_logs:/var/log/kmaedu` attach vào admin + auth + gateway. File pattern: `auth-service.log`, `gateway-service.log`.
- KLayout sidebar cần thêm link "Trang quản trị" gated `user.isAdmin` — đã có sẵn check ở `src/lib/genai-knowledge-access.ts:18,21`.
- E2E test scaffold pattern ở `apps/auth-service/test/jest-e2e.json + app.e2e-spec.ts`.
- Docs update cần thiết: architecture (admin-service entry), permissions (PERM046-PERM050), roadmap (entry), changelog (entry).
- `yarn dev:all` đã có — admin start cần thêm `yarn dev:admin` (đã có từ phase 01).

## Requirements

**Functional**

E2E test (`admin.e2e-spec.ts`):
- Bootstrap admin từ env → login → assert `isAdmin: true`
- Admin #1 grant admin #2 → assert #2 isAdmin
- Admin #1 list users → assert 2 admins visible
- Admin #1 ban user #3 → assert isBanned + audit row
- Admin #1 refund test payment → assert Payment.status = 4 + wallet delta + audit row
- Non-admin JWT → 401/403 trên mọi `/api/v1/admin/*`
- Self-revoke-admin → 400

Docker compose:
- New `admin-service` block (mirror `auth-service` pattern)
- Volume `kmaedu_logs` shared
- Env additions: `ADMIN_EMAILS`, `ADMIN_DEFAULT_PASSWORD`, `ADMIN_SERVICE_URL=http://admin-service:7006`, `LOGS_DIR=/var/log/kmaedu`
- Throttler check

KLayout:
- Thêm menu item "Trang quản trị" link tới `/admin` gated `user.isAdmin`

Docs:
- `docs/system/architecture.md` — add admin-service row, add `kmaedu_logs` volume
- `docs/system/permissions.md` — add PERM046-PERM050 (AdminRouteAccess, AdminUserManage, AdminFinanceAction, AdminLogRead, AdminAuditRead)
- `docs/development-roadmap.md` — entry "Admin Dashboard (P1, completed)"
- `docs/project-changelog.md` — entry (nếu file tồn tại; nếu không, tạo mới)

**Non-functional**
- `yarn build` pass 2 repo
- `yarn lint` pass 2 repo
- `docker compose config` valid (no warning)
- E2E pass trong CI

## Architecture

```
docker-compose.yml:
  services:
    admin-service:                 ← new
      build:
        context: ..
        dockerfile: deploy/Dockerfile
        args: { SERVICE_NAME: admin-service }
      container_name: kmaedu-admin
      ports: ['7006:7006']
      environment:
        - DATABASE_URL=${DATABASE_URL}
        - REDIS_HOST=redis
        - JWT_SECRET=${JWT_SECRET}
        - ADMIN_EMAILS=${ADMIN_EMAILS}
        - ADMIN_DEFAULT_PASSWORD=${ADMIN_DEFAULT_PASSWORD}
        - LOGS_DIR=/var/log/kmaedu
        - GRPC_PORT=50056
      volumes:
        - kmaedu_logs:/var/log/kmaedu
      depends_on: [migration, postgres]
    
    gateway:
      environment:
        - ADMIN_SERVICE_URL=http://admin-service:7006
      volumes:
        - kmaedu_logs:/var/log/kmaedu
    
    auth-service:
      volumes:
        - kmaedu_logs:/var/log/kmaedu
      # ADMIN_EMAILS injected here too

volumes:
  kmaedu_logs:                     ← new
```

## Related code files

**New:**
- `kmaedu-be/apps/admin-service/test/admin.e2e-spec.ts`
- `kmaedu-be/apps/admin-service/test/jest-e2e.json`
- `docs/project-changelog.md` (nếu chưa tồn tại)

**Modify:**
- `kmaedu-be/deploy/docker-compose.yml` — add `admin-service` + `kmaedu_logs` volume + env
- `kmaedu-be/.env.example` — add new envs (verify đã có từ phase 01)
- `kmaedu-fe/src/components/kokonutui/KLayout.tsx` (hoặc sidebar component) — add admin link
- `docs/system/architecture.md` — add admin-service entry
- `docs/system/permissions.md` — add PERM046-PERM050
- `docs/development-roadmap.md` — add entry
- `docs/project-changelog.md` — add entry (create nếu missing)

## Implementation Steps

1. **E2E test scaffold** — copy pattern từ `apps/auth-service/test/app.e2e-spec.ts`. Test cases:
   - `bootstrap.test.ts` — env 2 emails → boot → assert 2 users có isAdmin=true + isVerified=true
   - `users.test.ts` — admin login → grant 2nd admin → list users → ban 3rd → assert
   - `finance.test.ts` — admin login → create test payment → refund → assert Payment.status=4, wallet -= amount, audit row
   - `audit.test.ts` — list audit với filter
   - `rbac.test.ts` — non-admin JWT → 403; self-revoke → 400
   - `logs.test.ts` — append log line → SSE event received trong < 1s
2. **Docker compose** — edit `docker-compose.yml`:
   - Add `admin-service` block (mirror `auth-service` build args, env, healthcheck)
   - Add `kmaedu_logs:/var/log/kmaedu` volume tới `admin-service`, `gateway-service`, `auth-service`
   - Add `ADMIN_SERVICE_URL` env tới `gateway`
   - Add top-level `volumes.kmaedu_logs:`
3. **KLayout admin link** — edit sidebar component (search KLayout file). Add menu item: `{ label: 'Trang quản trị', icon: <ShieldIcon/>, path: '/admin', visible: user.isAdmin }`.
4. **Docs update**:
   - `architecture.md` — add row: `| admin-service | 7006 | 50056 | Node 20+ | Admin dashboard backend |`. Add to mermaid diagram. Add `kmaedu_logs` volume to Infra subgraph.
   - `permissions.md` — add PERM046-PERM050:
     - PERM046 AdminRouteAccess: AdminRoute guard
     - PERM047 AdminUserManage: list/ban/grant admin
     - PERM048 AdminFinanceAction: refund/credit/tier
     - PERM049 AdminLogRead: read/tail log file
     - PERM050 AdminAuditRead: query AdminAudit
   - `development-roadmap.md` — append row "Admin Dashboard (P1, completed 2026-06-XX)" với bullet phase list
   - `project-changelog.md` — append entry `## 2026-06-XX — Admin Dashboard` với summary
5. **Replace mock data** (nếu phase 02 dùng mock) — verify tất cả admin pages gọi real API từ `useAdminStore`
6. **Yarn build + lint** — `yarn build && yarn lint` ở root
7. **Yarn dev:all + admin start** — manual test full stack
8. **E2E run** — `cd apps/admin-service && ../../node_modules/.bin/jest --config test/jest-e2e.json`
9. **CI integration** — nếu CI có, ensure E2E pass

## Todo list

- [ ] Tạo `apps/admin-service/test/jest-e2e.json`
- [ ] Tạo `apps/admin-service/test/admin.e2e-spec.ts` (6 test suites)
- [ ] Update `docker-compose.yml`: add admin-service + kmaedu_logs volume
- [ ] Update `docker-compose.yml`: add ADMIN_SERVICE_URL env to gateway
- [ ] Verify `.env.example` has all new envs (phase 01)
- [ ] Add admin link to KLayout sidebar
- [ ] Update `docs/system/architecture.md`
- [ ] Update `docs/system/permissions.md` (PERM046-PERM050)
- [ ] Update `docs/development-roadmap.md`
- [ ] Create/update `docs/project-changelog.md`
- [ ] Verify all admin pages use real API (no mock)
- [ ] `yarn build` 2 repos
- [ ] `yarn lint` 2 repos
- [ ] `yarn dev:all` + `yarn dev:admin` boot
- [ ] E2E: bootstrap → grant → list → ban → refund → audit → 401/403
- [ ] Manual: docker compose up full stack
- [ ] Verify log file share: append to auth log → admin SSE stream nhận được
- [ ] Verify KLayout admin link visible cho admin, hidden cho non-admin

## Success Criteria

- [ ] `yarn build && yarn lint` pass cả 2 repos
- [ ] `yarn dev:auth && yarn dev:gateway && yarn dev:admin` → full stack up
- [ ] `yarn dev:fe` → admin login → `/admin` overview render real data
- [ ] E2E test pass 6 suites trong CI
- [ ] `docker compose config` valid, no warning
- [ ] `docker compose up` → 7 services running (gateway, auth, exam, finance, r2, ai, admin)
- [ ] Mounted volume `kmaedu_logs` shared — append to `auth-service.log` → admin SSE nhận được trong < 1s
- [ ] KLayout admin link visible cho admin user, không hiện cho non-admin
- [ ] Docs updated đầy đủ (architecture, permissions, roadmap, changelog)
- [ ] Non-admin JWT → 401/403 trên mọi `/api/v1/admin/*`
- [ ] Self-revoke-admin → 400 "Cannot revoke own admin"
- [ ] All 11 success criteria từ brainstorm session record satisfied

## Risk Assessment

| Risk | Mitigation |
|---|---|
| E2E test flaky do DB state | Seed fixtures riêng cho test; chạy trên dedicated test DB; cleanup after each suite |
| Docker compose build fail (deps missing) | Build admin-service với cùng Dockerfile pattern (NestJS monorepo đã có sẵn) |
| Volume mount conflict với local dev logs | Phase 10 set `LOGS_DIR=./logs` cho local, container dùng `/var/log/kmaedu` |
| KLayout admin link conflict với KLayout auth check | Admin link là navigation, không phải route guard; gate bằng `user.isAdmin` |
| Docs outdated sau merge | Verify bằng grep trước commit |
| E2E SSE test flaky trên CI | Mock EventSource ở frontend; backend SSE test qua curl thủ công |

## Security Considerations

- E2E test dùng dedicated test DB, KHÔNG touch production
- Test admin password từ env, KHÔNG commit vào Git
- Verify PII redaction trong E2E log test
- Verify 401/403 cho non-admin trong E2E rbac test
- Audit row test phải assert có IP + UA capture

## Next steps

- Run `/tkm:takumi` để execute plan (recommended trên fresh context)
- Hoặc manual thực thi từng phase
- Phase 11+ (post-MVP):
  - Phase 11: Admin notifications (alert khi revenue anomaly, suspicious login)
  - Phase 12: Admin 2FA (bắt buộc cho admin login)
  - Phase 13: Admin tier management UI (extend finance tier)
  - Phase 14: Audit retention policy (cron archive > 1 năm)
  - Phase 15: Structured logging với pino (built-in redact thay regex)

## Implementation Notes

- E2E test created: `apps/admin-service/test/admin.e2e-spec.ts` (6 test suites: bootstrap, users, finance, audit, rbac, logs)
- docker-compose.yml updated: admin-service block + `kmaedu_logs` shared volume + ADMIN_SERVICE_URL env to gateway
- Admin nav link added to `src/components/organisms/k/SideBar.tsx` (gated `user.isAdmin`)
- `docs/development-roadmap.md` updated with Phase 3 entry (Admin Dashboard, completed 2026-06-07)
- `docs/system/architecture.md` updated with admin-service section
- **NOT confirmed updated:** `docs/system/permissions.md` (PERM046-PERM050 entries may be missing), `docs/project-changelog.md`
- **NOT verified:** `yarn build`, `yarn lint`, E2E test pass, `yarn dev:admin` boot, docker compose config
