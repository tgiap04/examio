# Examio Rebuilt Specification Index

Generated: 2026-06-06
Pipeline: rebuild-spec v4.0.0 (full mode, sha5d4bf58, 13 features)
Plan: `plans/260605-2033-rebuild-spec/`

## System (curated)

- `system/overview.md` — System architecture, design decisions, technology stack
- `system/business-rules.md` — Plain-language BR summary
- `system/permissions.md` — Curated permission narrative
- `system/glossary.md` — Term:definition index

> Note: `system/architecture.md` is the canonical architecture file (Mermaid diagrams + tech stack).
> `data-model.md` is in `generated/entities.md` (renamed per docs-canonical-mapping.md).

## Generated (raw, free-regen)

- `generated/route-list.md` — All HTTP routes with auth requirements
- `generated/api-map.md` — Routes grouped by domain + BL### handlers
- `generated/entities.md` — Full data model (renamed from data-model.md)
- `generated/user-stories.md` — 62 US### blocks
- `generated/feature-list.md` — 13 features (F001–F013)
- `generated/screen-list.md` — 32 screens (SCR001–SCR032, 16 REG###)
- `generated/screen-flow.md` — Cross-screen navigation map
- `generated/behavior-logic.md` — 16 BL### items (NestJS + React)
- `generated/permissions-matrix.md` — 45-item PERM### matrix

## Flows (AI-drafted, per-entity)

- `flows/FLOW001_user-subscription.md` — UserSubscription tier transitions
- `flows/FLOW002_payment.md` — Payment status lifecycle
- `flows/FLOW003_exam-session.md` — ExamSession status lifecycle
- `flows/FLOW004_exam-attempt.md` — ExamAttempt status lifecycle
- `flows/FLOW005_user-storage.md` — UserStorage processing lifecycle
- `flows/FLOW006_wallet-transaction.md` — WalletTransaction ledger
- `flows/FLOW007_quiz-practice-attempt.md` — Practice attempt lifecycle

## Features (13 features, 4 files each = 52 files)

Each feature: `technical-spec.md`, `business-context.md`, `screens.md`, `edge-cases.md`

| Fcode | Slug | Domain |
|-------|------|--------|
| F001 | `F001_PublicLanding` | Public landing + contact form |
| F002 | `F002_Authentication` | Login, signup, reset, OAuth |
| F003 | `F003_AccountManagement` | Verification, sessions, devices |
| F004 | `F004_ProfileManagement` | Profile CRUD, avatar/banner |
| F005 | `F005_Finance` | Wallet, payment, subscription |
| F006 | `F006_QuizAuthoring` | Quiz set + question CRUD |
| F007 | `F007_FlashcardAuthoring` | Flashcard set + card CRUD |
| F008 | `F008_ExamHosting` | ExamRoom + session management |
| F009 | `F009_AITeacherKnowledgeBase` | Knowledge folders + graph |
| F010 | `F010_AITool` | AI test/flashcard generator |
| F011 | `F011_FlashcardStudy` | Study mode + progress |
| F012 | `F012_ExamTaking` | Quiz taking + cheating detection |
| F013 | `F013_SessionCleanup` | Cron job (background) |

## Screens (32 screen specs, 4 audience-aware files per feature)

See `screens/SCR###_Name/spec.md`. Each screen has Purpose, Layout, User Flow, Data Inventory, UI States, Validation, Interaction Patterns, Accessibility, Conditional Rendering, Security Surface, Source References.

| SCR | Screen | Route |
|-----|--------|-------|
| SCR001 | HomePage | `/` |
| SCR002 | AboutPage | `/about` |
| SCR003 | ContactPage | `/contact` |
| SCR004 | TermsPage | `/terms` |
| SCR005 | PrivacyPage | `/privacy` |
| SCR006 | CookiesPage | `/cookies` |
| SCR007 | SecurityPage | `/security` |
| SCR008 | LoginPage | `/login` |
| SCR009 | RegisterPage | `/register` |
| SCR010 | ForgotPasswordPage | `/forgot-password` |
| SCR011 | ResetPasswordPage | `/reset-password` |
| SCR012 | KRootRedirect | `/k` |
| SCR013 | ProfilePage | `/k/profile` |
| SCR014 | VerifyPage | `/k/verify` |
| SCR015 | SubscriptionPage | `/k/subscription` |
| SCR016 | MyMaterialsPage | `/k/my-materials` |
| SCR017 | FlashcardsPage | `/k/flash-card` |
| SCR018 | HistoryPage | `/k/history` |
| SCR019 | ExamHistoryPage | `/k/history/exam` |
| SCR020 | PDFHistoryPage | `/k/history/pdf` |
| SCR021 | ManageExamPage | `/k/manage-exam` |
| SCR022 | ManageQuizSetDetailPage | `/k/manage-quiz-set/:id` |
| SCR023 | ManageFlashcardSetDetailPage | `/k/manage-flashcard-set/:id` |
| SCR024 | AIToolPage | `/k/ai-tool` |
| SCR025 | GenAIKnowledgePage | `/k/genai-knowledge` |
| SCR026 | ManageExamRoomPage | `/k/manage-exam-room` |
| SCR027 | ManageExamRoomDetailPage | `/k/manage-exam-room/:id` |
| SCR028 | ExamRoomSessionAnalyticsPage | `/k/manage-exam-room/:id/session/:sessionId` |
| SCR029 | MyExamsPage | `/k/my-exams` |
| SCR030 | FlashcardStudyPage | `/study-flashcard/:id` |
| SCR031 | ExamSessionPage | `/exam-session/:id` |
| SCR032 | ExamQuizPage | `/exam-session/:id/quiz` |

## Plan Artifacts (audit trail)

- `plans/260605-2033-rebuild-spec/artifacts/` — All drafts + reports
- `plans/260605-2033-rebuild-spec/_archive/legacy-v3x/` — Stale v3.x output (archived)
- `docs/.rebuild-state.json` — Incremental planner state
