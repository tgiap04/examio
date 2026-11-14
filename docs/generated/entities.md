# Data Model — kmaedu

**Project**: kmaedu
**Generated**: 2026-06-05
**Source**: per-service Prisma schemas since phase 11 (`libs/database` was removed): `kmaedu-be/apps/auth-service/prisma/schema.prisma`, `apps/admin-service/prisma/schema.prisma`, `apps/content-service/prisma/schema.prisma`, `apps/assessment-service/prisma/schema.prisma`, `apps/ai-chat-service/prisma/schema.prisma`, `apps/study-room-service/prisma/schema.prisma`, `apps/vocabulary-service/prisma/schema.prisma`, `apps/document-service/prisma/schema.prisma`, `apps/ai-service/alembic/versions/0001_init.py` (ai-service, SQL, no Prisma). The model-to-service map enforced in CI is `kmaedu-be/scripts/check-model-ownership.ts`.

> **Per-service placement (phase 11).** Each service owns one Postgres schema; no foreign key crosses a service boundary. `userId`/`adminId`/`hostId` columns outside auth are plain strings (usually with an `@@index`) and no `@relation` to `User`; the ERD edges from `User` below are logical (resolved in the application via auth), not database FKs. Field tables were re-checked against the schema files in phase 19 (field names, nullability, scalar types); index lists and enum values are not re-derived, so the owning schema file wins.
>
> | Owner service (PG schema) | Models |
> |---|---|
> | auth (`auth`) | User, UserSession, VerifyAccountCode, ResetPasswordCode, RoleChangeLog, OutboxEvent, ProcessedEvent, R2DeleteTask (`r2_delete_tasks`) |
> | admin (`admin`) | AdminAudit, PageFeatureFlag, OutboxEvent, ProcessedEvent |
> | content (`content`, phase 14) | QuizSet, QuizSetLabel, QuizQuestion, DetailsQuizQuestion, FlashCardSet, FlashCardSetLabel, FlashCard, DetailsFlashCard, HistoryGeneratedQuizz, HistoryGeneratedFlashcard, QuizPracticeAttempt, FlashCardViewHistory, UserPinnedFlashcard, FlashcardStudyProgress, GenerationJob (phase 15), OutboxEvent, ProcessedEvent, R2DeleteTask |
> | assessment (`assessment`, phase 14) | ExamRoom, ExamSession (with its quiz snapshot), ExamAttempt, CheatingLog, UserPinnedExamRoom, OutboxEvent, ProcessedEvent |
> | ai-chat (`aichat`, phase 13) | AIChat, AIChatMessage, AIChatDocument, SubjectCategory, Subject, ProcessedEvent (no outbox), R2DeleteTask |
> | study-room (`studyroom`, phase 12) | StudyRoom, StudyRoomMember, StudyRoomPlaylistItem, StudyRoomChatBlock, ProcessedEvent (no outbox) |
> | vocabulary (`vocabulary`, phase 12) | WordFamilyCategory, WordFamily, UserSavedWordFamily, R2DeleteTask (`r2_delete_tasks`); no OutboxEvent/ProcessedEvent (no RabbitMQ) |
> | document (`document`, phase 15) | UserStorage, OutboxEvent, ProcessedEvent, R2DeleteTask (`r2_delete_tasks`) |
> | ai-service (`ai`, phase 15; Alembic) | Document, GraphIndex, GraphEntity, GraphRelationship, GraphTextUnitEntity, GraphCommunity, `outbox_events`, `processed_events` (the legacy DocumentEntity / UserStorageGraph / UserStorageGraphGroup were dropped by Alembic `0003`) |
>
> The exam schema no longer exists (exam-service was split into content, assessment, ai-chat, study-room, vocabulary and document). The tables below carry 36 detailed entities; PageFeatureFlag, the four StudyRoom* models and the three word-family models are not detailed here (see their feature specs and schema files).
>
> Only auth's own child tables (UserSession, VerifyAccountCode, ResetPasswordCode) still have a real FK to `User`. The finance schema and its models (`UserSubscription`, `Payment`, `Wallet`, `WalletTransaction`) and document's `UserMonthlyFileUpload` were removed with the wallet/subscription/payment feature. Phase 15: `UserStorage` moved to document-service; `Document`, `DocumentEntity`, `UserStorageGraph`, `UserStorageGraphGroup` moved to ai-service (schema `ai`). Every `userStorageId` / `documentId` outside document-service is now a plain column (no FK, no cascade): `HistoryGenerated*` in content, `AIChatDocument` in ai-chat, and the four ai tables. Cleanup runs on the `document.deleted` event, not by cascade. Where a relationship line or the ERD below still shows a UserStorage edge, read it as logical. `ExamRoom.quizSetId` (assessment) is likewise a plain string pointing at a content QuizSet, not an FK (deleting the set sets `sourceDeleted`, it does not cascade).

---

## Entity Relationship Diagram

```mermaid
erDiagram
    User {
        string id PK
        string email UK
        string username UK
        string name
        string avatar
        string role
        boolean isSystemAdmin
        int authzVersion
        boolean isBanned
        boolean isVerified
        datetime deletedAt
        datetime createdAt
    }
    UserSession ||--o| User : "belongs to"
    VerifyAccountCode ||--o| User : "belongs to"
    ResetPasswordCode ||--o| User : "belongs to"

    QuizSet ||--o{ QuizSetLabel : "has"
    QuizSet ||--o{ DetailsQuizQuestion : "contains"
    QuizSet ||..o{ ExamRoom : "used by (id only, no FK)"
    QuizSet ||--o{ QuizPracticeAttempt : "practiced via"
    QuizQuestion ||--o{ DetailsQuizQuestion : "instantiated in"
    HistoryGeneratedQuizz ||--o{ DetailsQuizQuestion : "sourced"
    QuizSetLabel ||--o{ DetailsQuizQuestion : "labels"

    FlashCardSet ||--o{ FlashCardSetLabel : "has"
    FlashCardSet ||--o{ DetailsFlashCard : "contains"
    FlashCard ||--o{ DetailsFlashCard : "instantiated in"
    HistoryGeneratedFlashcard ||--o{ DetailsFlashCard : "sourced"
    FlashCardSetLabel ||--o{ DetailsFlashCard : "labels"

    ExamRoom ||--o{ ExamSession : "schedules"
    ExamSession ||--o{ ExamAttempt : "taken by"
    ExamAttempt ||--o{ CheatingLog : "logs"
    UserPinnedExamRoom ||--o| ExamRoom : "pins"
    UserPinnedFlashcard ||--o| FlashCardSet : "pins"
    FlashCardViewHistory ||--o| FlashCardSet : "views"
    FlashcardStudyProgress ||--o| FlashCardSet : "tracks"
    QuizPracticeAttempt }o..|| User : "belongs to"


    UserStorage ||..o{ Document : "indexed as"
    UserStorage ||..o{ DocumentEntity : "chunked as"
    UserStorage ||..|| UserStorageGraph : "built into"
    UserStorageGraph ||--o{ UserStorageGraphGroup : "groups"
    UserStorage ||..o{ AIChatDocument : "attached to"
    AIChat ||--o{ AIChatMessage : "contains"
    AIChat ||--o{ AIChatDocument : "documents"
    AIChat }o--|| Subject : "teaches"
    Subject ||--o| SubjectCategory : "belongs to"

    User ||..o{ AIChat : "owns"
    User ||..o{ UserStorage : "owns"
    User ||..o{ QuizSet : "authored"
    User ||..o{ FlashCardSet : "authored"
    User ||..o{ ExamRoom : "hosts"
    User ||..o{ ExamAttempt : "takes"
    User ||..o{ HistoryGeneratedQuizz : "generates"
    User ||..o{ HistoryGeneratedFlashcard : "generates"
    User ||..o{ QuizPracticeAttempt : "practices"
    User ||..o{ FlashCardViewHistory : "views"
    User ||..o{ UserPinnedFlashcard : "pins"
    User ||..o{ UserPinnedExamRoom : "pins"
    User ||..o{ FlashcardStudyProgress : "tracks"
    AdminAudit }o..|| User : "performed by"
```

---

## Domain 1: User & Auth

### MODEL-001 User

**Owner**: auth-service. **Description**: Primary user account. Password optional (OAuth-only accounts have null password).

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, UNIQUE, NOT NULL | cuid |
| email | String | UNIQUE, NOT NULL | Login email |
| username | String | UNIQUE, NOT NULL | Display handle |
| name | String | NULL | Full name |
| avatar | String | NULL | Avatar URL |
| banner | String | NULL | Banner image URL |
| bio | String | NULL | Short bio |
| role | BaseRole | NOT NULL, DEFAULT STUDENT, INDEX | Base role: `STUDENT` or `TEACHER` (mutually exclusive) |
| isSystemAdmin | Boolean | NOT NULL, DEFAULT false, INDEX | SYSTEM_ADMIN flag; combines with either base role. Replaces `isAdmin` |
| authzVersion | Int | NOT NULL, DEFAULT 0 | JWT claim `av`; bumped in the same tx as every role / admin / ban / password change |
| isBanned | Boolean | NOT NULL, DEFAULT false | Soft-ban flag; banned users see 403 "Account suspended" |
| isVerified | Boolean | NOT NULL, DEFAULT false | Email verified flag |
| deletedAt | DateTime | NULL | Soft-delete timestamp; null = active |
| password | String | NULL | Bcrypt hash (null for OAuth-only) |
| utmSource | String(64) | NULL, INDEX | First-touch signup attribution source (`utm_source`); null = direct |
| createdAt | DateTime | NOT NULL | Account creation |
| updatedAt | DateTime | NOT NULL | Last update |
| createdBy | String | NULL | Creator ID (audit) |
| updatedBy | String | NULL | Updater ID (audit) |

**Relationships**:
- One-to-One with VerifyAccountCode via `userId` (FK, auth schema)
- One-to-One with ResetPasswordCode via `userId` (FK, auth schema)
- One-to-Many with UserSession via `userId` (FK, auth schema)
- Logical (no FK, other services keep `userId` and resolve the user over auth gRPC): QuizSet, FlashCardSet, HistoryGenerated*, QuizPracticeAttempt, FlashCardViewHistory, UserPinnedFlashcard, FlashcardStudyProgress, GenerationJob (content); ExamRoom (`hostId`), ExamAttempt, UserPinnedExamRoom (assessment); AIChat (ai-chat); UserStorage (document); AdminAudit (`adminId`, admin)

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-001-UK-01`: `email` (unique constraint)
- `MODEL-001-UK-02`: `username` (unique constraint)
- `MODEL-001-UK-03`: `id` (primary key, unique by default)

---

### MODEL-001b AdminAudit

**Owner**: admin-service. **Description**: Audit log entry written by `AuditWriterService` on every admin mutation. One row per changed field per action. Used for accountability and compliance.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Audit record ID |
| adminId | String | NOT NULL, INDEX | Auth-owned user id (no FK since phase 11) (the admin who performed the action) |
| targetId | String | NULL | ID of the entity being acted on (user ID, etc.) |
| action | String | NOT NULL | Action name (e.g. `user.ban`, `admin.role.set_base`) |
| payload | JSON | NULL | JSON diff of changed fields (before/after) |
| reason | String | NULL | Optional free-text reason given by the admin |
| ipAddress | String | NULL | Admin's client IP |
| userAgent | String | NULL | Admin's client user agent |
| createdAt | DateTime | NOT NULL | Timestamp of action |

**Relationships**:
- Logical link to User (auth-service) via `adminId` (plain column, no FK since phase 11). Indexes: `(adminId, createdAt DESC)` and `(action, createdAt DESC)`. The audit screen shows the actor as `name`, else `username` (resolved from auth), else `#<adminId>`

**Discriminator Fields**: None.

**Unique Codes**: None.

---

### MODEL-002 UserSession

**Owner**: auth-service. **Description**: Active login session, tied to a device. Tracks device/browser/OS for security and audit.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Session record ID |
| userId | String | FK, NOT NULL | References User.id |
| sessionId | String | UNIQUE, NOT NULL | Opaque session token |
| refreshToken | String | UNIQUE, NOT NULL | JWT refresh token |
| previousRefreshToken | String | NULL, UNIQUE | Token before the latest rotation, still accepted during the short grace window so parallel tabs do not log the user out |
| previousTokenExpiresAt | DateTime | NULL | End of that grace window |
| deviceId | String | NOT NULL | Device fingerprint |
| deviceName | String | NULL | Friendly device label |
| browser | String | NULL | Detected browser |
| os | String | NULL | Detected OS |
| ipAddress | String | NULL | Client IP |
| country | String | NULL | Geo country |
| city | String | NULL | Geo city |
| isActive | Boolean | NOT NULL, DEFAULT true | Session active flag |
| lastActivity | DateTime | NOT NULL | Last activity timestamp |
| createdAt | DateTime | NOT NULL | Session creation |
| expiresAt | DateTime | NOT NULL | Session expiry |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Many-to-One with User via `userId`

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-002-UK-01`: `sessionId` (unique)
- `MODEL-002-UK-02`: `refreshToken` (unique)

---

### MODEL-003 VerifyAccountCode

**Owner**: auth-service. **Description**: One-time email verification code for new account activation.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, UNIQUE, NOT NULL | Code record ID |
| userId | String | FK, UNIQUE, NOT NULL | References User.id |
| code | String | UNIQUE, NOT NULL | 6-digit OTP |
| expiresAt | DateTime | NOT NULL | Code expiry time |
| createdAt | DateTime | NOT NULL | Issue time |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- One-to-One with User via `userId` (Cascade delete on user delete)

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-003-UK-01`: `id` (primary key)
- `MODEL-003-UK-02`: `userId` (unique)
- `MODEL-003-UK-03`: `code` (unique)

---

### MODEL-004 ResetPasswordCode

**Owner**: auth-service. **Description**: One-time password reset code, sent to user email on request.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, UNIQUE, NOT NULL | Code record ID |
| userId | String | FK, UNIQUE, NOT NULL | References User.id |
| code | String | UNIQUE, NOT NULL | 6-digit OTP |
| expiresAt | DateTime | NOT NULL | Code expiry time |
| createdAt | DateTime | NOT NULL | Issue time |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- One-to-One with User via `userId` (Cascade delete on user delete)

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-004-UK-01`: `id` (primary key)
- `MODEL-004-UK-02`: `userId` (unique)
- `MODEL-004-UK-03`: `code` (unique)

---

### RoleChangeLog (phase 04)

**Owner**: auth-service. Audit trail of every role / admin-flag change. No foreign keys (rows outlive accounts; emails are snapshotted). Source: `apps/auth-service/prisma/schema.prisma`.

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | String | PK | |
| targetUserId / targetEmail | String | NOT NULL | Account changed |
| actorUserId | String | NULL | Null for CLI / bootstrap |
| actorEmail | String | NOT NULL | |
| fromRole / toRole | BaseRole | NOT NULL | |
| fromAdmin / toAdmin | Boolean | NOT NULL | |
| reason | String | NULL | |
| source | String | NOT NULL | `admin-ui`, `cli` or `bootstrap` |
| createdAt | DateTime | DEFAULT now(), INDEX (targetUserId, createdAt DESC) and (createdAt DESC) | |

---

## Domain 2: Quiz / Flashcard Authoring

### MODEL-007 QuizSet

**Owner**: content-service. **Description**: A authored quiz (collection of questions). Can be public or private, and is the source for ExamRooms and practice attempts.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | QuizSet ID (cuid) |
| title | String | NOT NULL | Quiz title |
| description | String | NULL | Optional description |
| userId | String | NOT NULL, INDEX | Author user ID |
| thumbnail | String | NULL | Cover image URL |
| isPublic | Boolean | NOT NULL, DEFAULT false | Public visibility flag |
| isPinned | Boolean | NOT NULL, DEFAULT false | Pinned in author UI |
| tags | String[] | NOT NULL, DEFAULT [] | Tag list for search/filter |
| accessCode | String | NULL | 6-digit invite code (phase 07); null = code sharing off |
| whitelist | String[] | NOT NULL, DEFAULT [], GIN index | User IDs granted by the owner (max 2000) |
| codeGrantedIds | String[] | NOT NULL, DEFAULT [], GIN index | User IDs who unlocked with the code; emptied on code rotate/disable (max 2000) |
| createdAt | DateTime | NOT NULL | Creation time |
| updatedAt | DateTime | NOT NULL | Last update |
| createdBy | String | NULL | Creator ID |
| updatedBy | String | NULL | Updater ID |

**Relationships**:
- Logical link to User (auth-service) via `userId` (plain column, no FK since phase 11)
- One-to-Many with QuizSetLabel via `quizSetId`
- One-to-Many with DetailsQuizQuestion via `quizSetId`
- One-to-Many with ExamRoom via `quizSetId`
- One-to-Many with QuizPracticeAttempt via `quizSetId`

**Discriminator Fields**: None.

---

### MODEL-008 QuizSetLabel

**Owner**: content-service. **Description**: Chapter/section label within a QuizSet, used to organize and optionally select questions by category.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Label ID |
| quizSetId | String | FK, NOT NULL | Parent QuizSet ID |
| name | String | NOT NULL | Label display name (e.g., "Chapter 1") |
| description | String | NULL | Optional label description |
| color | String | NULL | Hex color for UI (e.g., "#FF5733") |
| order | Int | NOT NULL, DEFAULT 0 | Sort order |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Many-to-One with QuizSet via `quizSetId` (Cascade delete)
- One-to-Many with DetailsQuizQuestion via `labelId`

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-008-UK-01`: `quizSetId + name` (composite unique)

---

### MODEL-009 QuizQuestion

**Owner**: content-service. **Description**: A reusable question item. The same question can be instantiated in multiple QuizSets via DetailsQuizQuestion.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Question ID |
| question | String | NOT NULL | Question text (may contain HTML/markdown) |
| options | String[] | NOT NULL | Array of answer option strings |
| answer | String | NOT NULL | Correct answer (must match one element in options) |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- One-to-Many with DetailsQuizQuestion via `quizQuestionId`

**Discriminator Fields**: None.

---

### MODEL-010 DetailsQuizQuestion

**Owner**: content-service. **Description**: Join table that places a QuizQuestion into a specific QuizSet, optionally tagging it with a label. Enables many-to-many relationship with per-instance metadata.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Record ID |
| quizSetId | String | FK, NOT NULL | Parent QuizSet ID |
| quizQuestionId | String | FK, NOT NULL | QuizQuestion ID |
| historyGeneratedQuizzId | String | FK, NULL | Source AI generation batch |
| labelId | String | FK, NULL | Optional QuizSetLabel assignment |

**Relationships**:
- Many-to-One with QuizSet via `quizSetId` (Cascade delete)
- Many-to-One with QuizQuestion via `quizQuestionId` (Cascade delete + update)
- Many-to-One with HistoryGeneratedQuizz via `historyGeneratedQuizzId` (SetNull on delete)
- Many-to-One with QuizSetLabel via `labelId` (SetNull on delete)

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-010-UK-01`: `quizSetId + quizQuestionId` (composite unique)

---

### MODEL-011 HistoryGeneratedQuizz

**Owner**: content-service. **Description**: Record of an AI-generated batch of quiz questions from a source document (UserStorage). Links back to the generated DetailsQuizQuestion instances.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Batch ID |
| userId | String | NOT NULL, INDEX | User who triggered generation |
| userStorageId | String | NULL, INDEX | Source document (`UserStorage.id` in document-service, no FK; nulled on `document.deleted`) |
| quizzes | Json | NOT NULL | Serialized quiz data (question objects) |
| createdAt | DateTime | NOT NULL | Generation time |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Logical link to User (auth-service) via `userId` (plain column, no FK since phase 11)
- Logical link to UserStorage via `userStorageId` (plain column since phase 15; set to null on `document.deleted`)
- One-to-Many with DetailsQuizQuestion via `historyGeneratedQuizzId`

**Discriminator Fields**: None.

---

### MODEL-012 FlashCardSet

**Owner**: content-service. **Description**: A authored flashcard deck. Supports public/private visibility and optional 6-digit access code for private sharing.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | FlashCardSet ID |
| title | String | NOT NULL | Deck title |
| userId | String | NOT NULL, INDEX | Author user ID |
| thumbnail | String | NULL | Cover image URL |
| description | String | NULL | Optional description |
| tag | String[] | NOT NULL, DEFAULT [] | Tag list |
| isPublic | Boolean | NOT NULL, DEFAULT false | Public visibility flag |
| isPinned | Boolean | NOT NULL, DEFAULT false | Pinned in author UI |
| viewCount | Int | NOT NULL, DEFAULT 0 | Public view counter |
| accessCode | String | NULL, INDEXED | 6-digit private access code |
| whitelist | String[] | NOT NULL, DEFAULT [] | User IDs with explicit access (max 2000) |
| codeGrantedIds | String[] | NOT NULL, DEFAULT [] | User IDs who unlocked with the code (phase 07); emptied on code rotate/disable |
| createdAt | DateTime | NOT NULL | Creation time |
| updatedBy | String | NULL | Updater ID |
| createdBy | String | NULL | Creator ID |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Logical link to User (auth-service) via `userId` (plain column, no FK since phase 11)
- One-to-Many with FlashCardSetLabel via `flashCardSetId`
- One-to-Many with DetailsFlashCard via `flashCardSetId`
- One-to-Many with FlashCardViewHistory via `flashCardSetId`
- One-to-Many with UserPinnedFlashcard via `flashcardSetId`
- One-to-Many with FlashcardStudyProgress via `flashCardSetId`

**Discriminator Fields**: None.

---

### MODEL-013 FlashCardSetLabel

**Owner**: content-service. **Description**: Chapter/section label within a FlashCardSet, used to organize and optionally select cards by category.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Label ID |
| flashCardSetId | String | FK, NOT NULL | Parent FlashCardSet ID |
| name | String | NOT NULL | Label display name |
| description | String | NULL | Optional label description |
| color | String | NULL | Hex color for UI |
| order | Int | NOT NULL, DEFAULT 0 | Sort order |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Many-to-One with FlashCardSet via `flashCardSetId` (Cascade delete)
- One-to-Many with DetailsFlashCard via `labelId`

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-013-UK-01`: `flashCardSetId + name` (composite unique)

---

### MODEL-014 FlashCard

**Owner**: content-service. **Description**: A reusable flashcard item (question/answer pair). Can be instantiated in multiple FlashCardSets.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Card ID |
| question | String | NOT NULL | Front of card |
| answer | String | NOT NULL | Back of card |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- One-to-Many with DetailsFlashCard via `flashCardId`

**Discriminator Fields**: None.

---

### MODEL-015 DetailsFlashCard

**Owner**: content-service. **Description**: Join table that places a FlashCard into a specific FlashCardSet, optionally tagging it with a label. Many-to-many with per-instance metadata.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Record ID |
| flashCardSetId | String | FK, NOT NULL | Parent FlashCardSet ID |
| flashCardId | String | FK, NOT NULL | FlashCard ID |
| historyGeneratedFlashcardId | String | FK, NULL | Source AI generation batch |
| labelId | String | FK, NULL | Optional FlashCardSetLabel assignment |

**Relationships**:
- Many-to-One with FlashCardSet via `flashCardSetId` (Cascade delete)
- Many-to-One with FlashCard via `flashCardId` (Cascade delete + update)
- Many-to-One with HistoryGeneratedFlashcard via `historyGeneratedFlashcardId` (SetNull on delete)
- Many-to-One with FlashCardSetLabel via `labelId` (SetNull on delete)

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-015-UK-01`: `flashCardSetId + flashCardId` (composite unique)

---

### MODEL-016 HistoryGeneratedFlashcard

**Owner**: content-service. **Description**: Record of an AI-generated batch of flashcards from a source document (UserStorage). Links back to the generated DetailsFlashCard instances.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Batch ID |
| userId | String | NOT NULL, INDEX | User who triggered generation |
| userStorageId | String | NULL, INDEX | Source document (`UserStorage.id` in document-service, no FK; nulled on `document.deleted`) |
| flashcards | Json | NOT NULL | Serialized flashcard data |
| createdAt | DateTime | NOT NULL | Generation time |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Logical link to User (auth-service) via `userId` (plain column, no FK since phase 11)
- Logical link to UserStorage via `userStorageId` (plain column since phase 15; set to null on `document.deleted`)
- One-to-Many with DetailsFlashCard via `historyGeneratedFlashcardId`

**Discriminator Fields**: None.

---

## Domain 3: Exam Lifecycle

### MODEL-017 ExamRoom

**Owner**: assessment-service. **Description**: A hosted exam event. References a QuizSet as content source and has a host (User). One ExamRoom can have multiple ExamSessions (e.g., scheduled re-runs).

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | ExamRoom ID |
| title | String | NOT NULL | Room title |
| description | String | NULL | Room description |
| quizSetId | String | NOT NULL, INDEX | Source QuizSet ID (content-service, no FK) |
| quizSetTitle | String | NOT NULL, DEFAULT "" | Title of the set when the room was created or re-pointed; student views read this and never call content |
| sourceDeleted | Boolean | NOT NULL, DEFAULT false | Set by `content.quizset.deleted`: no new session can be created, existing sessions keep their snapshot |
| hostId | String | NOT NULL, INDEX | Host User ID |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |
| createdBy | String | NULL | Creator ID |
| updatedBy | String | NULL | Updater ID |

**Relationships**:
- Logical link to User (auth-service) via `hostId` (plain column, no FK since phase 11)
- Logical link to QuizSet (content-service) via `quizSetId` (plain column, no FK; `sourceDeleted` is set on `content.quizset.deleted`)
- One-to-Many with ExamSession via `examRoomId`
- One-to-Many with UserPinnedExamRoom via `examRoomId`

**Discriminator Fields**: None.

---

### MODEL-018 ExamSession

**Owner**: assessment-service. **Description**: A specific scheduled instance of an ExamRoom. Holds scheduling, access control, question selection, and timing configuration. Students attempt via ExamAttempt.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Session ID |
| examRoomId | String | FK, NOT NULL | Parent ExamRoom ID |
| status | Int | NOT NULL, DEFAULT 0 | Lifecycle state |
| startTime | DateTime | NOT NULL | Scheduled start |
| endTime | DateTime | NULL | Actual/predicted end |
| timeLimitMinutes | Int | NULL | Time limit in minutes (null = unlimited) |
| autoJoinByLink | Boolean | NOT NULL, DEFAULT false | Allow auto-join on link click |
| assessType | Int | NOT NULL, DEFAULT 0 | Access type |
| allowRetake | Boolean | NOT NULL, DEFAULT false | Allow multiple attempts |
| maxAttempts | Int | NOT NULL, DEFAULT 1 | Max allowed attempts |
| accessCode | String | NULL, INDEXED | 6-digit private code |
| whitelist | String[] | NOT NULL, DEFAULT [] | User IDs with explicit access (max 2000 on write) |
| codeGrantedIds | String[] | NOT NULL, DEFAULT [] | User IDs who unlocked with the code (phase 07); emptied when the code changes or is cleared |
| showAnswersAfterSubmit | Boolean | NOT NULL, DEFAULT true | Show answer details on submit |
| passingScore | Float | NOT NULL, DEFAULT 0 | Min score % to pass (0 = no min) |
| questionCount | Int | NULL | Total questions to select (null = all) |
| questionSelectionMode | Int | NOT NULL, DEFAULT 0 | Question selection strategy |
| quizSnapshot | Json | NOT NULL | Immutable copy of the quiz set taken at creation (`QuizSnapshotV1`: `v`, `quizSetId`, `title`, `takenAt`, `contentHash`, `labels`, `questions`); validated with zod on every read, hidden from default Prisma selects; rewritten only by `refresh-snapshot` |
| quizSnapshotHash | String | NOT NULL | `contentHash` of the snapshot: in-process cache key and the drift check against content |
| labelQuestionConfig | Json | NULL | Array of { labelId, count } for RANDOM_BY_LABEL |
| shuffleQuestions | Boolean | NOT NULL, DEFAULT false | Shuffle question order per attempt |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |
| createdBy | String | NULL | Creator ID |
| updatedBy | String | NULL | Updater ID |

**Relationships**:
- Many-to-One with ExamRoom via `examRoomId` (Cascade delete)
- One-to-Many with ExamAttempt via `examSessionId`
- The quiz is read only from `quizSnapshot`; `POST /examsessions/:id/refresh-snapshot` re-takes it while the session is `UPCOMING` and has 0 attempts (else 409 `SNAPSHOT_LOCKED`); snapshots over 1 MB are refused (422 `QUIZSET_TOO_LARGE`)

**Discriminator Fields**:

| Field | DISC-### | Values | Description |
|-------|----------|--------|-------------|
| status | DISC-001 | 0, 1, 2 | Session lifecycle: 0=UPCOMING, 1=ONGOING, 2=ENDED |
| assessType | DISC-002 | 0, 1 | Access mode: 0=PUBLIC (anyone), 1=PRIVATE (code or whitelist) |
| questionSelectionMode | DISC-007 | 0, 1, 2 | Selection strategy: 0=ALL questions, 1=RANDOM_TOTAL, 2=RANDOM_BY_LABEL |

**Unique Codes**: None.

---

### MODEL-019 ExamAttempt

**Owner**: assessment-service. **Description**: A single student's attempt at an ExamSession. Tracks answers, score, violation count, and attempt lifecycle. Answers stored as JSON map (questionId -> selectedAnswer).

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Attempt ID |
| examSessionId | String | FK, NOT NULL | Session being attempted |
| userId | String | NOT NULL, INDEX | Student User ID |
| score | Float | NOT NULL | Calculated score |
| violationCount | Int | NOT NULL, DEFAULT 0 | Total cheating violations |
| startedAt | DateTime | NOT NULL | Attempt start time |
| finishedAt | DateTime | NULL | Attempt end time |
| status | Int | NOT NULL, DEFAULT 0 | Attempt lifecycle state |
| answers | Json | NOT NULL, DEFAULT "{}" | Map of questionId -> selectedAnswer |
| currentIndex | Int | NOT NULL, DEFAULT 0 | Current question navigator index |
| markedQuestions | String[] | NOT NULL, DEFAULT [] | IDs of flagged questions |
| totalQuestions | Int | NOT NULL, DEFAULT 0 | Total questions in this attempt |
| correctAnswers | Int | NOT NULL, DEFAULT 0 | Count of correct answers |
| selectedQuestionIds | String[] | NOT NULL, DEFAULT [] | Pre-selected question IDs for this attempt |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |
| createdBy | String | NULL | Creator ID |
| updatedBy | String | NULL | Updater ID |

**Relationships**:
- Many-to-One with ExamSession via `examSessionId` (Cascade delete)
- Logical link to User (auth-service) via `userId` (plain column, no FK since phase 11)
- One-to-Many with CheatingLog via `examAttemptId`

**Discriminator Fields**:

| Field | DISC-### | Values | Description |
|---------|----------|--------|-------------|
| status | DISC-008 | 0, 1, 2 | Attempt lifecycle: 0=IN_PROGRESS, 1=COMPLETED, 2=CANCELLED |

---

### MODEL-020 CheatingLog

**Owner**: assessment-service. **Description**: Per-attempt, per-type violation counter. One record per violation type (upserted by type). Tab switch, window blur, devtools open, copy-paste, right-click, fullscreen exit, print screen.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Log ID |
| examAttemptId | String | FK, NOT NULL | Parent ExamAttempt ID |
| type | String | NOT NULL | Violation type code |
| count | Int | NOT NULL, DEFAULT 1 | Occurrence count (incremented on re-violation) |
| description | String | NULL | Human-readable description |
| lastOccurredAt | DateTime | NOT NULL | Timestamp of last violation |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Many-to-One with ExamAttempt via `examAttemptId` (Cascade delete)

**Discriminator Fields**: None (type is a discriminator-like field but behavioral outcomes are handled by ExamAttempt.violationCount).

**Unique Codes**:
- `MODEL-020-UK-01`: `examAttemptId + type` (composite unique, upsert by type)

---

### MODEL-021 QuizPracticeAttempt

**Owner**: content-service. **Description**: A student's practice or real exam attempt on a QuizSet (outside of a scheduled ExamSession). Tracks answers, time, and score. Since phase 07 a user may hold many records per quizSet (history); at most one open (`isSubmitted=false`) attempt is resumed.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Attempt ID |
| quizSetId | String | FK, NOT NULL | Target QuizSet ID |
| userId | String | NOT NULL, INDEX | Student User ID |
| type | Int | NOT NULL, DEFAULT 0 | Attempt type |
| answers | Json | NOT NULL, DEFAULT "{}" | Map of questionId -> selectedAnswer |
| currentIndex | Int | NOT NULL, DEFAULT 0 | Current question navigator index |
| markedQuestions | String[] | NOT NULL, DEFAULT [] | Flagged question IDs |
| timeSpentSeconds | Int | NOT NULL, DEFAULT 0 | Elapsed time in seconds |
| timeLimitMinutes | Int | NULL | Time limit in minutes (null = unlimited) |
| isSubmitted | Boolean | NOT NULL, DEFAULT false | Submission flag |
| score | Float | NULL | Calculated score (null until submitted) |
| resultSnapshot | Json | NULL | Frozen per-question result (`id, question, options, selectedAnswer, correctAnswer, isCorrect`) written at submit; later edits to the set do not change it |
| totalQuestions | Int | NOT NULL, DEFAULT 0 | Total questions |
| correctAnswers | Int | NOT NULL, DEFAULT 0 | Correct answer count |
| startedAt | DateTime | NOT NULL | Attempt start |
| submittedAt | DateTime | NULL | Submission time |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |
| createdBy | String | NULL | Creator ID |
| updatedBy | String | NULL | Updater ID |

**Relationships**:
- Many-to-One with QuizSet via `quizSetId` (Cascade delete)
- Logical link to User (auth-service) via `userId` (plain column, no FK since phase 11)

**Discriminator Fields**:

| Field | DISC-### | Values | Description |
|-------|----------|--------|-------------|
| type | DISC-009 | 0, 1 | Attempt mode: 0=PRACTICE (practice test), 1=REAL (real exam) |

**Unique Codes**:
- `MODEL-021-UK-01`: `quizSetId + userId + type` (composite unique)

---

### MODEL-022 FlashCardViewHistory

**Owner**: content-service. **Description**: Denormalized view event log for a user viewing a flashcard deck. Used for "recently viewed" and analytics.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Record ID |
| userId | String | NOT NULL, INDEX | Viewer User ID |
| flashCardSetId | String | FK, NOT NULL | Viewed FlashCardSet ID |
| viewedAt | DateTime | NOT NULL | View timestamp |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Logical link to User (auth-service) via `userId` (plain column, no FK since phase 11)
- Many-to-One with FlashCardSet via `flashCardSetId` (Cascade delete)

**Discriminator Fields**: None.

---

### MODEL-023 FlashcardStudyProgress

**Owner**: content-service. **Description**: Per-user, per-deck study progress tracker. Stores which cards have been studied.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Progress ID |
| userId | String | NOT NULL, INDEX | Student User ID |
| flashCardSetId | String | FK, NOT NULL | Target deck ID |
| studiedCardIds | String[] | NOT NULL, DEFAULT [] | IDs of cards the user has studied |
| totalCards | Int | NOT NULL, DEFAULT 0 | Total cards in the deck |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Logical link to User (auth-service) via `userId` (plain column, no FK since phase 11)
- Many-to-One with FlashCardSet via `flashCardSetId` (Cascade delete)

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-023-UK-01`: `userId + flashCardSetId` (composite unique)

---

### MODEL-024 UserPinnedFlashcard

**Owner**: content-service. **Description**: User's pinned flashcard deck (for quick access). One pin per user per deck.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Pin record ID |
| userId | String | NOT NULL, INDEX | User ID |
| flashcardSetId | String | FK, NOT NULL | Pinned FlashCardSet ID |
| pinnedAt | DateTime | NOT NULL | Pin timestamp |

**Relationships**:
- Logical link to User (auth-service) via `userId` (plain column, no FK since phase 11)
- Many-to-One with FlashCardSet via `flashcardSetId` (Cascade delete)

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-024-UK-01`: `userId + flashcardSetId` (composite unique)

---

### MODEL-025 UserPinnedExamRoom

**Owner**: assessment-service. **Description**: User's pinned exam room (for quick access). One pin per user per room.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Pin record ID |
| userId | String | NOT NULL, INDEX | User ID |
| examRoomId | String | FK, NOT NULL | Pinned ExamRoom ID |
| pinnedAt | DateTime | NOT NULL | Pin timestamp |

**Relationships**:
- Logical link to User (auth-service) via `userId` (plain column, no FK since phase 11)
- Many-to-One with ExamRoom via `examRoomId` (Cascade delete)

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-025-UK-01`: `userId + examRoomId` (composite unique)

---

## Domain 4: AI / Storage / RAG

### MODEL-029 UserStorage

**Owner**: document-service. **Description**: User-uploaded file record, owned by document-service (schema `document`, phase 15). Stores metadata and R2/CDN URL. Also the anchor for document processing pipeline (OCR, chunking, graph building, done by ai-service).

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, UNIQUE, NOT NULL | Storage record ID |
| userId | String | NOT NULL, INDEX | Owner User ID |
| filename | String | NOT NULL | Original filename |
| url | String | NOT NULL | CDN/R2 public URL |
| mimetype | String | NOT NULL | MIME type |
| size | Int | NOT NULL | File size in bytes |
| keyR2 | String | UNIQUE, NOT NULL | R2 storage key |
| createdAt | DateTime | NOT NULL | Upload time |
| updatedAt | DateTime | NOT NULL | Last update |
| processingStatus | String | NOT NULL, DEFAULT "PENDING" | Processing pipeline state (no charge step; uploads are free) |
| queuedAt | DateTime | NULL | When `document.uploaded` was last written to the outbox; null = never queued (quick-upload) |
| pageCount | Int | NOT NULL, DEFAULT 0 | Pages found by OCR (`ai.document.processed`) |

**Relationships**:
- Logical link to User via `userId` (no FK since phase 11)
- Logical links from ai-service `Document`, `DocumentEntity`, `UserStorageGraph`, `UserStorageGraphGroup` via `userStorageId` (no FK since phase 15)
- Logical links from content `HistoryGeneratedQuizz`, `HistoryGeneratedFlashcard` via `userStorageId` and `GenerationJob` via `storageId`, and from ai-chat `AIChatDocument` via `documentId` (no FK since phase 15)

**Discriminator Fields**:

| Field | DISC-### | Values | Description |
|-------|----------|--------|-------------|
| processingStatus | DISC-014 | PENDING, PROCESSING, COMPLETED, FAILED | Document processing pipeline state |

**Unique Codes**:
- `MODEL-029-UK-01`: `id` (primary key, explicit unique)
- `MODEL-029-UK-02`: `keyR2` (unique)

---

### MODEL-030 Document

**Owner**: ai-service (schema `ai`). **Description**: Chunked and embedded content from a UserStorage file. One Document per file (1:1 with UserStorage). Content is stored alongside a vector embedding for semantic search.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, UNIQUE, NOT NULL | Document ID |
| userStorageId | String | NOT NULL, INDEX | Source UserStorage ID (document-service, no FK) |
| pageRange | String | NOT NULL | Pages included (e.g., "1-10") |
| title | String | NULL | Document title |
| content | String | NOT NULL | Extracted text content |
| embeddings | Unsupported("vector") | NOT NULL | Vector embedding for semantic search |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Logical link to UserStorage via `userStorageId` (no FK since phase 15; ai-service deletes these rows on `document.deleted`)

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-030-UK-01`: `id` (primary key, explicit unique)

---

### MODEL-031 DocumentEntity

**Owner**: ai-service (schema `ai`). **Description**: Named entity extracted from a document (person, concept, formula, etc.). Used for knowledge graph and entity-based retrieval.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Entity ID |
| userStorageId | String | NOT NULL, INDEX | Source UserStorage ID (document-service, no FK) |
| chunkId | String | NULL | Source chunk ID |
| name | String | NOT NULL | Entity name |
| type | String | NOT NULL | Entity type (e.g., "person", "formula") |
| description | String | NOT NULL, DEFAULT "" | Entity description |
| relatedNames | Json | NOT NULL, DEFAULT "[]" | Related entity names array |
| createdAt | DateTime | NOT NULL | Creation |

**Relationships**:
- Logical link to UserStorage via `userStorageId` (no FK since phase 15; ai-service deletes these rows on `document.deleted`)

**Discriminator Fields**: None.

---

### MODEL-032 UserStorageGraph

**Owner**: ai-service (schema `ai`). **Description**: Community detection graph built from a UserStorage document. One graph per file. Stores graph metadata, version, and community statistics.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Graph ID |
| userStorageId | String | UNIQUE, NOT NULL | Source UserStorage ID (document-service, no FK) |
| graphVersion | Int | NOT NULL, DEFAULT 1 | Graph build version |
| chunkSignature | String | NOT NULL | Hash of chunks used (for invalidation) |
| status | String | NOT NULL, DEFAULT "READY" | Graph readiness state |
| totalChunks | Int | NOT NULL, DEFAULT 0 | Number of chunks |
| totalEdges | Int | NOT NULL, DEFAULT 0 | Number of edges |
| totalCommunities | Int | NOT NULL, DEFAULT 0 | Number of detected communities |
| totalGroups | Int | NOT NULL, DEFAULT 0 | Number of graph groups |
| metadata | Json | NULL | Additional graph metadata |
| builtAt | DateTime | NOT NULL | Graph build timestamp |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Logical link to UserStorage via `userStorageId` (no FK since phase 15; ai-service deletes these rows on `document.deleted`)
- One-to-Many with UserStorageGraphGroup via `graphId`

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-032-UK-01`: `userStorageId` (unique)

---

### MODEL-033 UserStorageGraphGroup

**Owner**: ai-service (schema `ai`). **Description**: A community/group of chunks within a UserStorageGraph. Groups represent semantically coherent sections used for selective RAG retrieval.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Group ID |
| graphId | String | FK, NOT NULL | Parent UserStorageGraph ID |
| userStorageId | String | NOT NULL, INDEX | Source UserStorage ID (document-service, no FK) |
| groupIndex | Int | NOT NULL | Group index within the graph |
| communityId | Int | NULL | Louvain community ID |
| pageStart | Int | NULL | Start page number |
| pageEnd | Int | NULL | End page number |
| pageRanges | Json | NOT NULL | Page range array |
| chunkIds | Json | NOT NULL | Array of chunk IDs in this group |
| estimatedTokens | Int | NOT NULL, DEFAULT 0 | Token estimate for LLM context |
| charCount | Int | NOT NULL, DEFAULT 0 | Character count |
| weight | Float | NOT NULL, DEFAULT 1 | Retrieval weight score |
| summary | String | NULL | AI-generated group summary |
| metadata | Json | NULL | Additional metadata |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Many-to-One with UserStorageGraph via `graphId` (Cascade delete)
- Logical link to UserStorage via `userStorageId` (no FK since phase 15; ai-service deletes these rows on `document.deleted`)

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-033-UK-01`: `graphId + groupIndex` (composite unique)

---

### MODEL-034 AIChat

**Owner**: ai-chat-service. **Description**: An AI chat session. Can optionally be tied to a Subject (AI teacher). Supports multi-document context via AIChatDocument.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Chat ID |
| userId | String | NOT NULL, INDEX | Owner User ID |
| subjectId | String | FK, NULL | AI teacher Subject ID |
| title | String | NOT NULL, DEFAULT "" | Chat title |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Logical link to User (auth-service) via `userId` (plain column, no FK since phase 11)
- Many-to-One with Subject via `subjectId` (SetNull on delete)
- One-to-Many with AIChatMessage via `chatId`
- One-to-Many with AIChatDocument via `chatId`

**Discriminator Fields**: None.

---

### MODEL-035 AIChatMessage

**Owner**: ai-chat-service. **Description**: A single message in an AIChat session. Stores role, content, and optional image/document attachment.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Message ID |
| chatId | String | FK, NOT NULL | Parent AIChat ID |
| role | String | NOT NULL | Message author role: "user" \| "assistant" |
| content | String | NOT NULL | Message text content |
| imageUrl | String | NULL | Inline uploaded image URL |
| documentId | String | NULL | Referenced UserStorage document ID |
| documentName | String | NULL | Referenced document display name |
| createdAt | DateTime | NOT NULL | Message timestamp |

**Relationships**:
- Many-to-One with AIChat via `chatId` (Cascade delete)

**Discriminator Fields**: None.

---

### MODEL-036 AIChatDocument

**Owner**: ai-chat-service. **Description**: Junction table linking AIChat sessions to UserStorage documents. Enables multi-document chat context. Composite unique prevents duplicate documents per chat.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Record ID |
| chatId | String | FK, NOT NULL | Parent AIChat ID |
| documentId | String | NOT NULL, INDEX | UserStorage document ID (document-service, no FK) |
| documentName | String | NOT NULL | File name for display |
| createdAt | DateTime | NOT NULL | Attachment time |

**Relationships**:
- Many-to-One with AIChat via `chatId` (Cascade delete)
- Logical link to UserStorage via `documentId` (no FK since phase 15; the link is removed on `document.deleted`)

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-036-UK-01`: `chatId + documentId` (composite unique, prevents duplicate document per chat)

---

### MODEL-037 SubjectCategory

**Owner**: ai-chat-service. **Description**: Top-level category grouping for AI teacher Subjects (e.g., "Mathematics", "Natural Sciences"). Used for UI navigation.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Category ID |
| name | String | UNIQUE, NOT NULL | Category display name |
| slug | String | UNIQUE, NOT NULL | URL-friendly slug |
| description | String | NULL | Category description |
| icon | String | NULL | Emoji/icon for display |
| color | String | NULL | Hex color for category branding |
| order | Int | NOT NULL, DEFAULT 0 | Display sort order |
| isActive | Boolean | NOT NULL, DEFAULT true | Active flag |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- One-to-Many with Subject via `categoryId`

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-037-UK-01`: `name` (unique)
- `MODEL-037-UK-02`: `slug` (unique)

---

### MODEL-038 Subject

**Owner**: ai-chat-service. **Description**: An AI teacher subject. Each Subject has a system prompt that defines the AI's persona and behavior. Chats link to a Subject.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK, NOT NULL | Subject ID |
| categoryId | String | FK, NOT NULL | Parent SubjectCategory ID |
| name | String | UNIQUE, NOT NULL | Subject display name |
| slug | String | UNIQUE, NOT NULL | URL-friendly slug |
| description | String | NULL | Short description |
| icon | String | NULL | Emoji/icon for display |
| color | String | NULL | Hex color for subject branding |
| systemPrompt | String | NOT NULL, @db.Text | LLM system prompt |
| order | Int | NOT NULL, DEFAULT 0 | Display order within category |
| isActive | Boolean | NOT NULL, DEFAULT true | Active flag |
| createdAt | DateTime | NOT NULL | Creation |
| updatedAt | DateTime | NOT NULL | Last update |

**Relationships**:
- Many-to-One with SubjectCategory via `categoryId` (Cascade delete)
- One-to-Many with AIChat via `subjectId`

**Discriminator Fields**: None.

**Unique Codes**:
- `MODEL-038-UK-01`: `name` (unique)
- `MODEL-038-UK-02`: `slug` (unique)

### GenerationJob (content, phase 15; no MODEL code assigned yet, run `/tkm:rebuild-spec` to allocate one)

**Owner**: content-service. **Description**: One quiz/flashcard generation request (no charge; created `QUEUED` with its outbox row in one transaction). Source: `apps/content-service/prisma/schema.prisma`.

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| id | String | PK | Job ID (also the `jobId` returned to the client) |
| userId | String | NOT NULL | Owner (auth user id, no FK) |
| storageId | String | NOT NULL | Source document (`UserStorage.id` in document-service, no FK) |
| filename | String | NOT NULL | Source file name |
| type | String | NOT NULL | `quiz` or `flashcard` |
| status | String | NOT NULL, DEFAULT "QUEUED" | `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| options | Json | NOT NULL | `numItems`, `isNarrowSearch`, `keyword?` |
| model | String | NULL | Model name |
| error | String | NULL | Failure reason (e.g. `GENERATION_TIMEOUT`) |
| historyId | String | NULL | `HistoryGeneratedQuizz` / `HistoryGeneratedFlashcard` row of a COMPLETED job |
| createdAt, updatedAt | DateTime | NOT NULL | Timestamps |

---

## Validation Rules

> Derived from NOT NULL, UNIQUE, and CHECK constraints in the per-service Prisma schemas. Cross-field business rules (e.g., score bounds, expiry validation) must be confirmed against implementation.

### MODEL-001 User

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-001 | email | NOT NULL, UNIQUE | Email is required and must be unique |
| VR-002 | username | NOT NULL, UNIQUE | Username is required and must be unique |

### MODEL-003 VerifyAccountCode

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-003 | code | UNIQUE | Verification code must be unique |

### MODEL-004 ResetPasswordCode

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-004 | code | UNIQUE | Reset code must be unique |

### MODEL-008 QuizSetLabel

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-005 | quizSetId + name | UNIQUE | Label name must be unique within a QuizSet |

### MODEL-010 DetailsQuizQuestion

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-006 | quizSetId + quizQuestionId | UNIQUE | Question can only be added once to a QuizSet |

### MODEL-013 FlashCardSetLabel

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-007 | flashCardSetId + name | UNIQUE | Label name must be unique within a FlashCardSet |

### MODEL-015 DetailsFlashCard

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-008 | flashCardSetId + flashCardId | UNIQUE | Card can only be added once to a FlashCardSet |

### MODEL-020 CheatingLog

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-009 | examAttemptId + type | UNIQUE | One log entry per violation type per attempt |

### MODEL-021 QuizPracticeAttempt

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-010 | quizSetId + userId + type | ~~UNIQUE~~ removed (migration `20261020132225_quiz_sharing`) | Replaced by non-unique index `(quizSetId, userId, isSubmitted)`; attempt history is kept |

### MODEL-023 FlashcardStudyProgress

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-011 | userId + flashCardSetId | UNIQUE | One progress record per user per deck |

### MODEL-024 UserPinnedFlashcard

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-012 | userId + flashcardSetId | UNIQUE | User can only pin each deck once |

### MODEL-025 UserPinnedExamRoom

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-013 | userId + examRoomId | UNIQUE | User can only pin each room once |

### MODEL-036 AIChatDocument

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-014 | chatId + documentId | UNIQUE | Document can only be attached once per chat |

### MODEL-037 SubjectCategory

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-015 | name | UNIQUE | Category name must be unique |
| VR-016 | slug | UNIQUE | Category slug must be unique |

### MODEL-038 Subject

| Rule | Field | Constraint | Error Message |
|------|-------|------------|---------------|
| VR-017 | name | UNIQUE | Subject name must be unique |
| VR-018 | slug | UNIQUE | Subject slug must be unique |

---

## Discriminator Summary

| Code | Entity | Field | Values | Behavioral Impact |
|------|--------|-------|--------|-------------------|
| DISC-001 | ExamSession | status | 0=UPCOMING, 1=ONGOING, 2=ENDED | Controls joinability, timer visibility, and submission behavior |
| DISC-002 | ExamSession | assessType | 0=PUBLIC, 1=PRIVATE | Controls whether access code/whitelist is required |
| DISC-007 | ExamSession | questionSelectionMode | 0=ALL, 1=RANDOM_TOTAL, 2=RANDOM_BY_LABEL | Determines how selectedQuestionIds are populated on ExamAttempt |
| DISC-008 | ExamAttempt | status | 0=IN_PROGRESS, 1=COMPLETED, 2=CANCELLED | Controls answer editability and whether results are shown |
| DISC-009 | QuizPracticeAttempt | type | 0=PRACTICE, 1=REAL | Affects score display, retake rules, and analytics categorization |
| DISC-013 | UserStorage | processingStatus | PENDING, PROCESSING, COMPLETED, FAILED | Controls whether document is available for AI chat and generation |

---

## Summary

- **Total Entities**: 44 across 9 schemas (40 Prisma models + 4 ai-service tables, excluding the per-service `OutboxEvent` / `ProcessedEvent` / `R2DeleteTask` infrastructure tables); 36 are detailed above
- **Total Domains**: 4
- **Total Unique Constraints**: 16 (composite + scalar)
- **Total Discriminator Fields**: 8 (codes DISC-003, 004, 006, 010, 011 and 012 were removed with the finance models and are not reused)
- **Polymorphic / Junction Tables**: DetailsQuizQuestion, DetailsFlashCard, AIChatDocument, UserStorageGraphGroup (junction between graph and userStorage)