---
title: "Phase 6: Seed Data + Integration Testing"
description: "Create seed file for 10 Word Family categories, generate AI images, upload to R2, integration testing"
status: pending
priority: P2
effort: 3h
branch: feat.grammary-learn
created: 2026-06-14
---

## Context Links

- Parent: [plan.md](../plan.md)
- Dependencies: Phase 1, 2, 3, 4, 5
- Reports: [codebase-scan](../reports/researcher-260614-1506-codebase-scan.md)

## Overview

**Date:** 2026-06-14
**Description:** Create seed file for 10 default categories, generate AI images for thumbnails, upload to R2, integration testing.
**Priority:** P2
**Status:** pending

## Key Insights

- Seed file pattern: `PrismaClient` + `upsert by slug` idempotent — follow `subject.seed.ts`
- AI image generation: use existing AI service image generation endpoint (check if exists) or create new one
- Image upload: use existing R2 service pattern
- Integration testing: test full flow from category → root words → word family → save → flashcard

## Requirements

### Functional
- Seed file creates 10 categories with Vietnamese names, slugs, descriptions
- AI-generated images for each category thumbnail
- Images uploaded to R2, URLs saved in category records
- Integration test: full flow works end-to-end

### Non-functional
- Seed is idempotent (safe to re-run)
- Images are appropriate for category theme
- All 10 categories have valid image URLs after seed

## 10 Seed Categories

| # | Name (Vietnamese) | Slug | Description |
|---|-------------------|------|-------------|
| 1 | Mua sắm, nhà hàng | shopping-restaurant | Vocabulary related to shopping, markets, and dining |
| 2 | Giao thông, công trường | traffic-construction | Words for transportation, roads, and construction |
| 3 | Nơi làm việc, thời gian rảnh rỗi | workplace-leisure | Workplace vocabulary and leisure activities |
| 4 | Vị trí, chức danh | position-title | Job titles, positions, and roles |
| 5 | Địa điểm, vị trí | location-place | Places, locations, and geographic terms |
| 6 | Hội họp, công việc, văn phòng | meeting-work-office | Meetings, office work, and business vocabulary |
| 7 | Du lịch, giải trí | travel-entertainment | Travel, tourism, and entertainment words |
| 8 | Ngân hàng, bưu điện | banking-post-office | Banking, finance, and postal services |
| 9 | Thông báo, hướng dẫn, quảng cáo | announcement-advertising | Public signs, instructions, and advertising |
| 10 | Tin tức, phát thanh, du lịch | news-broadcasting-travel | News, broadcasting, and travel journalism |

## Architecture

### Seed File Structure

```typescript
// examio-be/libs/database/src/seed/word-family-category.seed.ts

const categories = [
  {
    name: "Mua sắm, nhà hàng",
    slug: "shopping-restaurant",
    description: "Vocabulary related to shopping, markets, and dining",
    imageUrl: null,  // Will be updated after AI image generation
    order: 1,
  },
  // ... 9 more
];

export async function wordFamilyCategorySeed(prisma: PrismaClient) {
  for (const cat of categories) {
    await prisma.wordFamilyCategory.upsert({
      where: { slug: cat.slug },
      update: { ...cat },
      create: { ...cat },
    });
    console.log(`✓ WordFamilyCategory: ${cat.name}`);
  }
}
```

### AI Image Generation (Optional Enhancement)

If AI image generation endpoint exists in ai-service:
- Call `POST /api/generate/image` with category name as prompt
- Upload result to R2
- Update category `imageUrl` field

Otherwise: Use placeholder images or skip image generation in initial seed.

## Related Code Files

### Files to Create
- `examio-be/libs/database/src/seed/word-family-category.seed.ts` — seed file

### Files to Modify
- `examio-be/libs/database/prisma/seed.ts` — import and call seed

## Implementation Steps

1. **Create `word-family-category.seed.ts`**:
   - Define 10 categories with Vietnamese names, slugs, descriptions
   - Use `upsert` with `slug` as unique key
   - Set `imageUrl: null` initially
   - Set `order` from 1-10
2. **Update `seed.ts`**:
   - Import `wordFamilyCategorySeed`
   - Call after `subjectSeed()` (if category order matters)
3. **Run seed locally**:
   - `cd examio-be && yarn prisma seed`
   - Verify 10 categories created
4. **Generate AI images** (if time permits):
   - For each category, call AI image generation
   - Upload to R2
   - Update `imageUrl` in database
5. **Integration testing**:
   - Test category list API: `GET /word-family/categories`
   - Test root words API: `GET /word-family/categories/shopping-restaurant/roots`
   - Test generate API: `POST /word-family/generate`
   - Test save API: `POST /word-family/:id/save`
   - Test flashcard bridge: `POST /word-family/:id/to-flashcard`
   - Test admin CRUD: `POST /admin/word-family/categories`
6. **Update `phase-01-database-prisma.md`** with actual image URLs after generation

## Todo List

- [ ] Create `word-family-category.seed.ts` with 10 categories
- [ ] Update `seed.ts` to call new seed
- [ ] Run seed locally and verify
- [ ] Generate AI images for each category (if endpoint exists)
- [ ] Upload images to R2 and update URLs
- [ ] Integration test: category list API
- [ ] Integration test: root words API
- [ ] Integration test: generate API
- [ ] Integration test: save API
- [ ] Integration test: flashcard bridge
- [ ] Integration test: admin CRUD

## Success Criteria

- Seed creates exactly 10 categories
- Seed is idempotent (re-running doesn't duplicate)
- All categories have valid slugs (kebab-case, unique)
- Category order is 1-10
- Integration tests pass for all endpoints
- Images uploaded to R2 (if generation implemented)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI image generation fails | Medium | Low | Use placeholder, skip in initial seed |
| R2 upload fails | Low | Low | Retry, show error in seed log |
| Seed order wrong | Low | Low | Verify order field after seed |

## Security Considerations

- Seed runs with PrismaClient (same permissions as app)
- No user data in seed
- Image URLs are R2 URLs (not exposing internal paths)

## Next Steps

- Deploy to staging
- E2E testing with Playwright/Cypress
- Monitor Redis cache hit rates
- Optimize based on usage patterns
