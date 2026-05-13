# Data Model: Migrate Frontend to Vite

## 1. Migrated Route

**Description**: A user-facing route that must remain reachable and meaningful after the frontend migration.

**Fields**:
- `path`: Canonical browser path users can visit directly.
- `legacySource`: Current page or route-group source being replaced.
- `accessLevel`: Public, authenticated, or role-sensitive.
- `layoutContext`: Shared shell or layout expectations for the route.
- `featureArea`: Landing, auth, dashboard, study, AI, profile, exam-session, or history.
- `status`: Planned, migrated, validated, or approved fallback.
- `redirectBehavior`: Expected redirect or recovery behavior when access preconditions are not met.

**Validation Rules**:
- `path` must be unique within the migrated application.
- Every in-scope legacy route must map to one migrated route or one approved fallback.
- Authenticated or role-sensitive routes must define redirect behavior.

**Relationships**:
- Belongs to one `Feature Capability`.
- Can depend on zero or more `Integration Touchpoints`.
- Can be protected by one `Access Rule`.

## 2. Feature Capability

**Description**: A business-facing user flow or screen family that stakeholders use to verify parity.

**Fields**:
- `name`: Capability name such as Login, Teacher Dashboard, AI Teacher, Materials, or Exam Session.
- `priority`: P1, P2, or P3 based on spec importance.
- `routes`: Set of migrated routes supporting the capability.
- `coreActions`: Key user actions that must remain usable.
- `acceptanceChecks`: Behavioral checks used during parity review.
- `fallbackNotes`: Approved deviations from current behavior, if any.
- `status`: Not started, in validation, passed, blocked, or accepted with fallback.

**Validation Rules**:
- Every P1 capability must define at least one end-to-end acceptance check.
- Capability acceptance cannot be marked complete while any blocking route issue remains unresolved.

**Relationships**:
- Aggregates one or more `Migrated Route` records.
- Depends on one or more `Integration Touchpoints`.
- Can reference one `Fallback Behavior Record`.

## 3. Access Rule

**Description**: The user access conditions for a route or capability.

**Fields**:
- `scope`: Route-level, layout-level, or capability-level.
- `authRequired`: Whether an authenticated session is required.
- `roleConstraint`: Optional role requirement such as teacher or student-specific behavior.
- `redirectTarget`: Destination when access is denied or session is missing.
- `returnPathSupport`: Whether the user should be returned to the original destination after sign-in.
- `sessionRecoveryBehavior`: Expected behavior when an active session becomes invalid.

**Validation Rules**:
- Protected routes must define an access rule.
- Redirect target must be user-reachable and meaningful.
- If `returnPathSupport` is enabled, the originating destination must be preserved consistently.

**Relationships**:
- Protects one or more `Migrated Route` records.
- Can be triggered by one `Session State` transition.

## 4. Session State

**Description**: The visible frontend session condition that influences routing and user access.

**Fields**:
- `state`: Unknown, authenticated, unauthenticated, invalidated, or initializing.
- `userPresence`: Whether user profile data is available.
- `tokenPresence`: Whether a token exists locally.
- `recoveryAction`: Refresh user, redirect to sign-in, or clear local session.

**State Transitions**:
- `initializing -> authenticated` when user initialization succeeds.
- `initializing -> unauthenticated` when no valid session exists.
- `authenticated -> invalidated` when backend signals forced sign-out.
- `invalidated -> unauthenticated` after local session cleanup and redirect.

**Relationships**:
- Drives `Access Rule` outcomes.
- Influences protected `Migrated Route` behavior.

## 5. Integration Touchpoint

**Description**: A backend-connected frontend capability that must continue working after migration.

**Fields**:
- `name`: Integration area such as Auth API, Exam Session API, AI Chat API, Profile API, or Subscription API.
- `surface`: API wrapper module or store interaction surface.
- `dependentCapabilities`: Capabilities that rely on this integration.
- `failureMode`: User-visible outcome when the integration fails.
- `validationMethod`: Manual flow check or acceptance scenario used to confirm parity.

**Validation Rules**:
- Every P1 capability must list its critical integration touchpoints.
- Failure mode must map to a user-visible error or recovery behavior.

**Relationships**:
- Supports one or more `Feature Capability` records.
- Can be referenced by one or more `Migrated Route` records.

## 6. Fallback Behavior Record

**Description**: An approved user-facing replacement for a current behavior that cannot be preserved exactly during migration.

**Fields**:
- `legacyBehavior`: Current behavior being replaced.
- `replacementBehavior`: Approved new behavior shown to users.
- `reason`: Why exact parity is impractical.
- `affectedCapabilities`: Related routes or flows.
- `approvalStatus`: Proposed, approved, or rejected.
- `stakeholderNotes`: Acceptance notes or conditions.

**Validation Rules**:
- Every fallback record must clearly describe user impact.
- No fallback can be considered accepted without explicit approval status.

**Relationships**:
- Can be linked from `Feature Capability` or `Migrated Route`.
