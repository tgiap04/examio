# Rebuild Spec Session Context

Generated: 2026-05-27
Work context: /Users/tgiap.dev/devs/examio
Artifacts: /Users/tgiap.dev/devs/examio/plans/260527-1951-rebuild-spec/artifacts
Output docs: /Users/tgiap.dev/devs/examio/docs
DOCX output: /Users/tgiap.dev/devs/examio/docx

## Scope
- Backend: examio-be (NestJS monorepo + Python FastAPI AI/OCR services)
- Frontend: examio-fe (React 19 + Vite + TypeScript)
- Mobile: examio-app (Kotlin Multiplatform, Android Compose, iOS SwiftUI)

## Source Of Truth
- Wave 0 combined scout: scout-report.md
- Workspace scouts: scout-report-be.md, scout-report-fe.md, scout-report-app.md

## Key Notes
- Backend gateway is public API entry point; frontend/mobile mostly call gateway API prefix /api/v1.
- Prisma/PostgreSQL models cover auth, finance, learning content, exams, AI chat, storage/documents, subjects.
- Web frontend is production wired via Axios/Zustand.
- Mobile shared KMP API/repository layer is real; most Android/iOS feature UIs currently use mock UiState data except auth.
