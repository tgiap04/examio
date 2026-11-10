---
title: "Word Family Integration — AI-powered Vocabulary Learning"
description: "Tích hợp học từ vựng Word Family bằng AI: category browsing, tree/list view, personal save, flashcard bridge"
status: pending
priority: P2
effort: 6 phases (~28h)
branch: feat.grammary-learn
tags: [word-family, ai, flashcard, exam-service, frontend]
created: 2026-06-14
---
# Word Family Integration — Implementation Plan

## Overview

Epic "Tích hợp học từ vựng Word Family bằng AI" — 4 user stories: browse categories + root words, tree/list detail view, personal save, flashcard bridge. Path C (Hybrid): Word Family là content type trong exam-service, bridge layer tái sử dụng FlashCard creation flow hiện có.

## Key Decisions (Locked)

- **Phase Order:** DB → AI → Backend → Admin → FE → Seed
- **DB Models:** `WordFamilyCategory` (seeded, admin-managed) + `WordFamily` (global cache, AI-generated) + `UserSavedWordFamily` (reference-based, O(1) lookup)
- **Cache:** Redis (BE) + Zustand TTL 5 min (FE) — same pattern as existing modules
- **FlashCard Bridge:** **Async (job queue)** — tạo job → trả jobId → user poll. Map `WordFamilyWord[]` → `FlashCard.question` (word + POS) + `FlashCard.answer` (meaningVi + example), reuse `Prisma.$transaction` pattern
- **Tree View:** `react-d3-tree` library, custom node renderer for Word Family
- **JSON Schema:** `{ rootWord, categorySlug, words: [{ word, pos, meaningEn, meaningVi, example, affix: {prefix, root, suffix} }] }`
- **Admin:** CRUD categories in `/admin/word-family` — extend admin-service + FE admin panel
- **Image:** Bắt buộc gen AI cho category thumbnail, upload lên R2
- **Root words:** 10/category, **DEDUP** dựa trên user generation history (không gen trùng root words đã gen trước đó, nếu gen quá 5 lần cho 1 chủ đề có thể lặp lại 1 vài từ root)
- **Progress:** Reuse `FlashcardStudyProgress` (không tạo model mới)
- **Auth Guard:** Bearer auth cho **tất cả** endpoints (category list, root words, detail, save, bridge)

## Architecture

```
FE (React 19)                    BE (NestJS)                       AI (Python)
┌──────────────────┐            ┌──────────────────────┐          ┌──────────────┐
│ WordFamilyPage   │◄──HTTP───►│ WordFamilyController │◄─HTTP───►│ ai-service    │
│ WordFamilyDetail │            │ WordFamilyService     │          │ /generate/    │
│ AdminWordFamily  │            │ WordFamilyBridge     │          │ word-family   │
│ react-d3-tree    │            │ FlashcardsetService  │          └──────────────┘
└────────┬─────────┘            └──────────┬───────────┘
         │                               │
┌────────▼─────────┐            ┌────────▼────────────┐
│ useWordFamilyStore│            │  Prisma (PostgreSQL) │
│ (Zustand + TTL)  │            │  Redis (cache)        │
└──────────────────┘            └─────────────────────┘
```

## Phases

| \# | Phase | Status | Effort | Dependencies |
| --- | --- | --- | --- | --- |
| 1 | [Database & Prisma Migration](phase-01-database-prisma.md) | **completed** | \~3h | — |
| 2 | [Python AI Service — Word Family Endpoint](phase-02-python-ai-endpoint.md) | pending | \~4h | — |
| 3 | [NestJS Backend — WordFamily Module](phase-03-nestjs-backend.md) | **completed** | \~5h | 1, 2 |
| 4 | [Admin Panel — Word Family CRUD](phase-05-admin-panel.md) | pending | \~4h | 3 |
| 5 | [Frontend — Word Family UI + Store](phase-04-frontend-ui-store.md) | pending | \~6h | 3 |
| 6 | [Seed Data + Integration Testing](phase-06-seed-integration.md) | **completed** | \~3h | 4, 5 |

## Reports

- `/Users/tgiap.dev/devs/kmaedu/plans/reports/researcher-260614-1506-flashcard-module-scan.md`
- `/Users/tgiap.dev/devs/kmaedu/plans/reports/researcher-260614-1506-ai-service-integration.md`
- `/Users/tgiap.dev/devs/kmaedu/plans/reports/researcher-260614-1506-codebase-scan.md`
- `/Users/tgiap.dev/devs/kmaedu/plans/reports/researcher-260614-1516-schema-flashcard-subject.md`