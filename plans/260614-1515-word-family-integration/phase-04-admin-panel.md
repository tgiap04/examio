---
title: "Phase 4: Admin Panel — Word Family CRUD"
description: "Add Word Family category management in admin panel: list, create, edit, delete, image upload to R2"
status: pending
priority: P2
effort: 4h
branch: feat.grammary-learn
created: 2026-06-14
---

## Context Links

- Parent: [plan.md](../plan.md)
- Dependencies: Phase 1 (schema), Phase 3 (API endpoints)
- Reports: [codebase-scan](../reports/researcher-260614-1506-codebase-scan.md)

## Overview

**Date:** 2026-06-14
**Description:** Add Word Family category management in admin panel. Admin can CRUD categories + upload AI-generated images to R2.
**Priority:** P2
**Status:** pending

## Key Insights

- Admin panel is in `/admin/*` with `AdminRoute` guard
- Gateway proxies `/api/v1/admin/*` to admin-service (external service at :7006)
- Frontend admin panel lives in `examio-fe/src/pages/admin/`
- Need to check if admin-service is separate repo or part of this monorepo
- Admin audit logging via `AuditWriterService` (existing pattern)

## Requirements

### Functional
- **Category list** (`/admin/word-family`): Table with name, slug, image, order, isActive, actions
- **Create category**: Form with name, slug (auto-generate), description, image upload
- **Edit category**: Update name, description, image, order, isActive
- **Delete category**: Soft-delete (set isActive = false)
- **Image upload**: Upload to R2, get URL, save to category
- **Audit logging**: Every mutation logged via `AuditWriterService`

### Non-functional
- Admin-only access (AdminGuard)
- Audit trail for all mutations
- Image upload: multipart/form-data to R2 service

## Architecture

### Admin-Service Module (if internal)

```
examio-be/apps/admin-service/src/modules/
├── admin-word-family/
│   ├── admin-word-family.module.ts
│   ├── admin-word-family.controller.ts
│   └── admin-word-family.service.ts
```

### Frontend Admin Page

```
examio-fe/src/pages/admin/
├── AdminWordFamilyPage.tsx           # Category list + CRUD
├── components/
│   ├── WordFamilyCategoryForm.tsx    # Create/Edit form
│   ├── WordFamilyCategoryTable.tsx   # Data table
│   └── ImageUploader.tsx             # R2 upload component
```

### Gateway Proxy Routes

```
gateway-service:
  POST /api/v1/admin/word-family/categories  → admin-service
  GET  /api/v1/admin/word-family/categories   → admin-service
  PUT  /api/v1/admin/word-family/categories/:id → admin-service
  DELETE /api/v1/admin/word-family/categories/:id → admin-service
```

## Related Code Files

### Files to Check
- `examio-be/apps/admin-service/` — check if exists in this repo
- `examio-be/apps/gateway-service/src/controllers/admin-proxy.controller.ts` — existing proxy pattern

### Files to Create (if admin-service internal)
- `examio-be/apps/admin-service/src/modules/admin-word-family/` — module

### Files to Modify
- `examio-be/apps/gateway-service/src/controllers/admin-proxy.controller.ts` — add routes
- `examio-fe/src/routes/index.tsx` — add admin route
- `examio-fe/src/routes/layouts/AdminLayout.tsx` — add nav item
- `examio-fe/src/pages/admin/` — create admin page

## Implementation Steps

1. **Check admin-service location**:
   - If `examio-be/apps/admin-service/` exists → extend it
   - If external repo → add API endpoints there + update gateway proxy
2. **Read existing admin module pattern** (e.g., `AdminUsersModule`) — understand structure
3. **Create admin-word-family module** (if internal):
   - Module with Prisma + AuditWriterService
   - Controller with CRUD endpoints
   - Service with business logic + audit logging
4. **Add gateway proxy routes**:
   - Read `admin-proxy.controller.ts`
   - Add proxy routes for `/word-family/categories/*`
5. **Create frontend admin page**:
   - `AdminWordFamilyPage.tsx` — page with table + form
   - `WordFamilyCategoryTable.tsx` — data table component
   - `WordFamilyCategoryForm.tsx` — create/edit form
   - `ImageUploader.tsx` — R2 upload component
6. **Add route** in `routes/index.tsx`:
   - `/admin/word-family` → `AdminWordFamilyPage`
7. **Add nav item** in `AdminLayout.tsx`:
   - Add to `NAV_ITEMS` array: `{ path: "/admin/word-family", label: "wordFamily", icon: BookOpen }`
8. **Add API functions** in `examio-fe/src/apis/adminApi.ts`:
   - `getWordFamilyCategoriesApi()`
   - `createWordFamilyCategoryApi()`
   - `updateWordFamilyCategoryApi()`
   - `deleteWordFamilyCategoryApi()`
9. **Test locally** — verify admin can CRUD categories

## Todo List

- [ ] Check admin-service location (internal vs external)
- [ ] Create admin-word-family module (if internal)
- [ ] Add gateway proxy routes
- [ ] Create `AdminWordFamilyPage.tsx`
- [ ] Create `WordFamilyCategoryTable.tsx`
- [ ] Create `WordFamilyCategoryForm.tsx`
- [ ] Create `ImageUploader.tsx`
- [ ] Add route in `routes/index.tsx`
- [ ] Add nav item in `AdminLayout.tsx`
- [ ] Add API functions in `adminApi.ts`
- [ ] Test locally

## Success Criteria

- Admin can view list of Word Family categories
- Admin can create category with name, slug, description, image
- Admin can edit category (update fields, upload new image)
- Admin can soft-delete category (isActive = false)
- All mutations logged in AdminAudit table
- Image uploaded to R2, URL saved in category
- Navigation works: `/admin/word-family` → page loads

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Admin-service is external repo | High | Medium | Coordinate with separate repo, PR to both |
| Image upload fails | Medium | Low | Show error toast, allow retry |
| Gateway proxy missing route | Medium | High | Add all routes, test with curl |

## Security Considerations

- `AdminGuard` required for all endpoints
- Audit logging for all mutations (existing pattern)
- Image upload uses existing R2 service (already secured)
- Slug auto-generation prevents invalid URLs

## Next Steps

- Phase 6: Seed data + integration testing
