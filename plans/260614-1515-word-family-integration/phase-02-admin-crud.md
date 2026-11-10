# Phase 2: Admin CRUD for Word Family Categories

## Context
- Admin service: `kmaedu-be/apps/admin-service/src/`
- Reference pattern: `kmaedu-be/apps/admin-service/src/modules/admin-users/`
- Gateway proxy: `kmaedu-be/apps/gateway-service/src/controllers/admin-proxy.controller.ts`
- Prisma schema: `kmaedu-be/libs/database/src/schema.prisma`

## Overview
Add admin CRUD module in admin-service for managing Word Family categories (create/edit/delete/toggle active). Includes R2 upload for AI-generated category thumbnails.

**Priority:** P1 | **Status:** pending | **Effort:** 4h

## Key Insights
- Gateway already proxies `/api/v1/admin/*` via catch-all — no gateway changes needed
- Follow exact pattern of `admin-users`: controller + service + module + dto
- Use `AdminGuard` + `ZodValidationPipe` + `Throttle` (existing conventions)
- Category image upload uses existing `R2ClientService`

## Requirements
- GET `/admin/word-family/categories` — list all categories (paginated)
- GET `/admin/word-family/categories/:id` — category detail with root word count
- POST `/admin/word-family/categories` — create category (name, description, image)
- PATCH `/admin/word-family/categories/:id` — update category
- DELETE `/admin/word-family/categories/:id` — delete category (cascade root words + words)
- PATCH `/admin/word-family/categories/:id/toggle-active` — toggle isActive
- POST `/admin/word-family/categories/:id/image` — upload/replace category image

## Architecture

### API Endpoints
```
GET    /api/v1/admin/word-family/categories
GET    /api/v1/admin/word-family/categories/:id
POST   /api/v1/admin/word-family/categories
PATCH  /api/v1/admin/word-family/categories/:id
DELETE /api/v1/admin/word-family/categories/:id
PATCH  /api/v1/admin/word-family/categories/:id/toggle-active
POST   /api/v1/admin/word-family/categories/:id/image
```

### DTOs (Zod)
- `CreateWordFamilyCategoryDto` — name: string, description?: string, sortOrder?: number
- `UpdateWordFamilyCategoryDto` — name?: string, description?: string, sortOrder?: number
- `ListWordFamilyCategoriesDto` — page, limit, search?, isActive?

### Cache Invalidation
- On any CUD: invalidate Redis key `word-family:categories:*`

## Files to Create
- `kmaedu-be/apps/admin-service/src/modules/admin-word-family/admin-word-family.module.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-word-family/admin-word-family.controller.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-word-family/admin-word-family.service.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-word-family/dto/create-category.body.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-word-family/dto/update-category.body.ts`
- `kmaedu-be/apps/admin-service/src/modules/admin-word-family/dto/list-categories.query.ts`

## Files to Modify
- `kmaedu-be/apps/admin-service/src/admin-service.module.ts` — register `AdminWordFamilyModule`
- `kmaedu-be/apps/admin-service/src/main.ts` — import word family module if needed

## Implementation Steps

1. Create `AdminWordFamilyModule` following `AdminUsersModule` pattern
2. Create DTOs with Zod schemas:
   - `CreateWordFamilyCategoryDto`: name (required string), description (optional), sortOrder (optional int)
   - `UpdateWordFamilyCategoryDto`: all fields optional
   - `ListWordFamilyCategoriesDto`: page (default 1), limit (default 20), search (optional), isActive (optional bool)
3. Create `AdminWordFamilyService`:
   - `listCategories(query)` — paginated with search and isActive filter
   - `getCategoryDetail(id)` — include _count of rootWords
   - `createCategory(dto)` — with R2 image upload support
   - `updateCategory(id, dto)` — with image replacement
   - `deleteCategory(id)` — cascade delete, also delete R2 image
   - `toggleActive(id)` — flip isActive boolean
4. Create `AdminWordFamilyController`:
   - All endpoints guarded by `AdminGuard` + `@UseGuards(AdminGuard)`
   - Throttle: `{ admin: { ttl: 60000, limit: 30 } }`
   - Swagger decorators
5. Register module in `AdminServiceModule`
6. Verify gateway proxy works (no changes needed — catch-all handles it)

## Todo
- [ ] Create admin-word-family module directory structure
- [ ] Create DTOs with Zod validation
- [ ] Implement AdminWordFamilyService
- [ ] Implement AdminWordFamilyController
- [ ] Create AdminWordFamilyModule
- [ ] Register in AdminServiceModule
- [ ] Add Swagger decorators
- [ ] Test endpoints via curl/postman through gateway
- [ ] Verify R2 image upload works

## Success Criteria
- All 7 endpoints respond correctly through gateway proxy
- CRUD operations create/update/delete categories in DB
- Image upload stores to R2 and returns public URL
- Pagination and search work correctly
- Toggle active works and respects filter

## Risk Assessment
- Gateway catch-all might not handle file uploads correctly — Test with multipart/form-data
- R2 upload failure should not prevent category creation (make image optional)

## Security Considerations
- All endpoints behind `AdminGuard` — only admins can access
- Rate limiting via `Throttle` decorator
- Image file type validation (JPEG, PNG, WebP only)

## Next Steps
- Phase 7: Frontend admin page (depends on this API)
- Phase 3-4: Can run in parallel (no dependency)
