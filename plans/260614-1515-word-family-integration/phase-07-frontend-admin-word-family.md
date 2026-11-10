# Phase 7: Frontend - Admin Word Family Management Page

## Context
- Admin layout: `kmaedu-fe/src/routes/layouts/AdminLayout.tsx`
- Admin routes: `kmaedu-fe/src/routes/index.tsx` (children under `/admin`)
- Admin users page: `kmaedu-fe/src/pages/admin/AdminUsersPage.tsx` (reference pattern)
- Admin API: uses gateway proxy `/api/v1/admin/*`

## Overview
Add admin CRUD page for managing Word Family categories. Follows existing admin page patterns with table view, create/edit modal, and image upload.

**Priority:** P2 | **Status:** pending | **Effort:** 3h

## Key Insights
- Admin pages use `AdminLayout` + `AdminRoute` guard (existing)
- Table + modal pattern same as AdminUsersPage
- Image upload uses existing R2 upload component if available, else simple file input
- Gateway proxy already handles `/api/v1/admin/word-family/*` (from Phase 2)

## Requirements
- Table view of all categories (name, description, image thumbnail, root word count, active status, actions)
- Create category modal: name, description, image upload, sort order
- Edit category modal: same fields, pre-filled
- Delete category with confirmation dialog
- Toggle active status with switch
- Search/filter by name
- Pagination

## Architecture

### New Route
```
/admin/word-family  → AdminWordFamilyPage (child of AdminLayout)
```

### Component Tree
```
AdminWordFamilyPage
├── AdminWordFamilyHeader (title + "Create" button)
├── AdminWordFamilyTable
│   ├── TableHeader (name, description, image, rootWords, status, actions)
│   └── TableRow × N
│       ├── Category name
│       ├── Description (truncated)
│       ├── Image thumbnail (R2 URL or placeholder)
│       ├── Root word count
│       ├── Active status toggle (Switch)
│       └── Actions: Edit button, Delete button
├── AdminWordFamilyPagination
└── CategoryFormModal (create/edit)
    ├── Name input
    ├── Description textarea
    ├── Image upload (file input + preview)
    ├── Sort order number input
    └── Save / Cancel buttons
```

## Files to Create
- `kmaedu-fe/src/pages/admin/AdminWordFamilyPage.tsx`
- `kmaedu-fe/src/components/organisms/admin/word-family/AdminWordFamilyTable.tsx`
- `kmaedu-fe/src/components/organisms/admin/word-family/AdminWordFamilyRow.tsx`
- `kmaedu-fe/src/components/organisms/admin/word-family/CategoryFormModal.tsx`
- `kmaedu-fe/src/apis/adminWordFamilyApi.ts`

## Files to Modify
- `kmaedu-fe/src/routes/index.tsx` — add admin word-family route

## Implementation Steps

1. Create `adminWordFamilyApi.ts`:
   - `getCategories(page, limit, search?)` — GET /api/v1/admin/word-family/categories
   - `getCategoryDetail(id)` — GET /api/v1/admin/word-family/categories/:id
   - `createCategory(data, imageFile?)` — POST /api/v1/admin/word-family/categories
   - `updateCategory(id, data, imageFile?)` — PATCH /api/v1/admin/word-family/categories/:id
   - `deleteCategory(id)` — DELETE /api/v1/admin/word-family/categories/:id
   - `toggleActive(id)` — PATCH /api/v1/admin/word-family/categories/:id/toggle-active
   - `uploadImage(id, file)` — POST /api/v1/admin/word-family/categories/:id/image

2. Create `AdminWordFamilyPage.tsx`:
   - State: categories list, pagination, search, modal state
   - Fetch categories on mount + on search/pagination change
   - Header with title and "Thêm danh mục" button

3. Create `AdminWordFamilyTable.tsx`:
   - Table with columns matching requirements
   - Sortable headers (optional)
   - Loading skeleton

4. Create `AdminWordFamilyRow.tsx`:
   - Display category data with image thumbnail
   - Active status toggle (Switch component)
   - Edit/Delete action buttons
   - Delete confirmation dialog

5. Create `CategoryFormModal.tsx`:
   - Dual purpose: create and edit mode
   - Form fields with validation (Zod schema on FE)
   - Image upload with preview
   - Submit handler calls create or update API

6. Add route to `index.tsx`:
   ```typescript
   { path: "word-family", element: <AdminWordFamilyPage /> }
   ```

7. Test all CRUD operations through the UI

## Todo
- [ ] Create adminWordFamilyApi.ts
- [ ] Create AdminWordFamilyPage.tsx
- [ ] Create AdminWordFamilyTable.tsx
- [ ] Create AdminWordFamilyRow.tsx
- [ ] Create CategoryFormModal.tsx
- [ ] Add route to index.tsx
- [ ] Test create category with image upload
- [ ] Test edit category
- [ ] Test delete category with confirmation
- [ ] Test toggle active status
- [ ] Test search and pagination

## Success Criteria
- Table displays all categories with correct data
- Create modal creates category and refreshes table
- Edit modal updates category and refreshes table
- Delete shows confirmation, then removes category
- Active toggle works immediately
- Search filters categories by name
- Pagination works correctly
- Image upload stores to R2 and displays thumbnail

## Risk Assessment
- Image upload through gateway proxy may fail → test multipart/form-data forwarding
- Large table (>50 categories) → pagination handles this

## Security Considerations
- Page behind `AdminRoute` guard (existing)
- All API calls go through admin proxy (authenticated + admin-only)
- Image upload validates file type (JPEG, PNG, WebP)

## Next Steps
- Phase 8: Integration + E2E testing (all phases complete)
