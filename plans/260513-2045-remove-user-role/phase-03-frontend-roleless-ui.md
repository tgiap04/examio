# Phase 03 - Frontend Roleless UI

## Context
Remove role from frontend user types, auth requests, OAuth URLs, redirects, guards, sidebar filtering, and teacher/student page branching.

## Impacted Files
- `kmaedu-fe/src/types/user.ts`
- `kmaedu-fe/src/apis/authApi.ts`
- `kmaedu-fe/src/stores/useAuthStore.ts`
- `kmaedu-fe/src/routes/guards/PublicRoute.tsx`
- `kmaedu-fe/src/routes/guards/TeacherRoute.tsx`
- `kmaedu-fe/src/components/organisms/TeacherRoute.tsx`
- `kmaedu-fe/src/routes/index.tsx`
- `kmaedu-fe/src/pages/k/KRootRedirect.tsx`
- `kmaedu-fe/src/pages/k/DashboardStudentPage.tsx`
- `kmaedu-fe/src/pages/k/DashboardTeacherPage.tsx`
- `kmaedu-fe/src/pages/k/AITeacherPage.tsx`
- `kmaedu-fe/src/pages/k/MyMaterialsPage.tsx`
- `kmaedu-fe/src/pages/k/HistoryPage.tsx`
- `kmaedu-fe/src/pages/k/ManageExamPage.tsx`
- `kmaedu-fe/src/pages/k/ManageExamRoomPage.tsx`
- `kmaedu-fe/src/pages/k/ManageExamRoomDetailPage.tsx`
- `kmaedu-fe/src/pages/k/ExamRoomSessionAnalyticsPage.tsx`
- `kmaedu-fe/src/pages/k/AIToolPage.tsx`
- `kmaedu-fe/src/app/k/ai-student/page.tsx`
- `kmaedu-fe/src/app/k/genai-knowledge/page.tsx`
- `kmaedu-fe/src/lib/genai-knowledge-access.ts`
- `kmaedu-fe/src/components/organisms/k/SideBar.tsx`
- `kmaedu-fe/src/components/organisms/auth/signin-form.tsx`
- `kmaedu-fe/src/components/organisms/auth/signup-form.tsx`
- `kmaedu-fe/src/components/organisms/auth/role-selection.tsx`
- `kmaedu-fe/src/components/organisms/auth/auth-layout-shell.tsx`

## Implementation Steps
1. Remove `UserRole` and `role` from `User`, `CredentialsSignup`, auth API payloads, and Zustand auth method signatures.
2. Remove role selection UI from sign-in/sign-up and delete the dedicated role selection component if unused.
3. Stop appending `role` to Google/Facebook/GitHub OAuth URLs.
4. Replace role-based redirects with one destination; recommended `/k` resolving to a unified dashboard or `/k/dashboard-student` as a compatibility default.
5. Remove or simplify `TeacherRoute` wrappers so protected pages rely on `ProtectedRoute` plus backend ownership checks.
6. Make sidebar show roleless feature navigation, except keep allowlisted GenAI knowledge access by email/admin policy if still desired.
7. Remove text labels like `Role: teacher` and profile display of `Giáo viên/Học sinh`.
8. Preserve chat message `role` types in AI stores/APIs and ARIA `role` attributes in UI components.

## Success Criteria
- Complete: Fresh login/register/OAuth works against a backend user shape with no `role` field.
- Complete: Reloading with stale localStorage user objects does not depend on `role` for rendering.
- Complete: UI redirects no longer loop because `user.role` is undefined.
- Complete: Users can access formerly teacher/student features based on auth and backend ownership rules.
- Complete: GenAI knowledge remains restricted by `isAdmin` or email allowlist, and AI chat message roles/ARIA roles were preserved.

## Product Decision Needed
Resolved for this cleanup: roleless redirects/navigation now use the unified `/k` flow while legacy dashboard/page names remain for compatibility. Full route renaming or dashboard consolidation is deferred.
