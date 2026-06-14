---
title: "Remove GenAI Knowledge Base + Add Word Family to Sidebar"
description: "Remove the 'Kho tri thuc GenAI' feature from frontend and backend (preserving AI Chat), add Word Family nav entry to KLayout sidebar"
status: pending
priority: P2
effort: 4h
branch: feat.grammary-learn
tags: [cleanup, word-family, genai-knowledge, sidebar]
created: 2026-06-14
---

## Overview

Two independent changes:
1. **Remove "Kho tri thuc GenAI"** — the frontend page, sidebar entry, backend knowledge-base routes, and Python tutor router. Preserve AI Chat, file upload, and generation routes.
2. **Add Word Family to sidebar** — wire the existing Word Family pages into the KLayout navigation.

## Phase 1 — Frontend: Remove GenAI Knowledge Page + Sidebar Entry
- Status: pending
- Details: `phase-01-frontend-remove-genai-knowledge.md`

## Phase 2 — Backend: Remove Knowledge-Base Routes (NestJS)
- Status: pending
- Details: `phase-02-backend-remove-knowledge-routes.md`

## Phase 3 — Backend: Remove Knowledge-Base Routes (Python AI Service)
- Status: pending
- Details: `phase-03-python-remove-tutor-router.md`

## Phase 4 — Frontend: Add Word Family to Sidebar
- Status: pending
- Details: `phase-04-frontend-add-word-family-sidebar.md`

## Key Dependencies
- Phase 1 and Phase 2 are independent (FE vs BE)
- Phase 3 depends on Phase 2 (Python removal mirrors NestJS removal)
- Phase 4 is independent of all others
- All phases are independent of the Prisma migration (already applied)

## Risk Assessment
- **Preservation boundary**: AI Chat, file upload/generation, quiz/flashcard generation must remain functional
- **Data hygiene**: Removing knowledge-base code means the `deleteUpload` cascade in `ai.repository.ts` no longer cleans up `aIChatDocument` rows — minor, acceptable
- **Prisma models**: `UserStorage`, `Document` are kept (shared with AI Chat)
