# Rebuild Spec Session Context

Generated: 2026-05-27
Work context: /Users/tgiap.dev/devs/kmaedu
Artifacts: /Users/tgiap.dev/devs/kmaedu/plans/260527-1951-rebuild-spec/artifacts
Output docs: /Users/tgiap.dev/devs/kmaedu/docs
DOCX output: /Users/tgiap.dev/devs/kmaedu/docx

## Scope
- Backend: kmaedu-be (NestJS monorepo + Python FastAPI AI/OCR services)
- Frontend: kmaedu-fe (React 19 + Vite + TypeScript)
- Mobile: kmaedu-app (Kotlin Multiplatform, Android Compose, iOS SwiftUI)

## Source Of Truth
- Wave 0 combined scout: scout-report.md
- Workspace scouts: scout-report-be.md, scout-report-fe.md, scout-report-app.md

## Key Notes
- Backend gateway is public API entry point; frontend/mobile mostly call gateway API prefix /api/v1.
- Prisma/PostgreSQL models cover auth, finance, learning content, exams, AI chat, storage/documents, subjects.
- Web frontend is production wired via Axios/Zustand.
- Mobile shared KMP API/repository layer is real; most Android/iOS feature UIs currently use mock UiState data except auth.
