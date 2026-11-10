import { createBrowserRouter } from "react-router-dom";
import HomePage from "@/pages/landing/HomePage";
import AboutPage from "@/pages/landing/AboutPage";
import ContactPage from "@/pages/landing/ContactPage";
import TermsPage from "@/pages/landing/TermsPage";
import PrivacyPage from "@/pages/landing/PrivacyPage";
import CookiesPage from "@/pages/landing/CookiesPage";
import SecurityPage from "@/pages/landing/SecurityPage";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import KRootRedirect from "@/pages/k/KRootRedirect";
import ProfilePage from "@/pages/k/ProfilePage";
import VerifyPage from "@/pages/k/VerifyPage";
import MyMaterialsPage from "@/pages/k/MyMaterialsPage";
import FlashcardsPage from "@/pages/k/FlashcardsPage";
import HistoryPage from "@/pages/k/HistoryPage";
import ExamHistoryPage from "@/pages/k/ExamHistoryPage";
import PDFHistoryPage from "@/pages/k/PDFHistoryPage";
import FlashcardStudyPage from "@/pages/study-flashcard/FlashcardStudyPage";
import ExamSessionPage from "@/pages/exam-session/ExamSessionPage";
import ExamQuizPage from "@/pages/exam-session/ExamQuizPage";
import ManageExamPage from "@/pages/k/ManageExamPage";
import ManageQuizSetDetailPage from "@/pages/k/ManageQuizSetDetailPage";
import ManageFlashcardSetDetailPage from "@/pages/k/ManageFlashcardSetDetailPage";
import AIToolPage from "@/pages/k/AIToolPage";
import ManageExamRoomPage from "@/pages/k/ManageExamRoomPage";
import ManageExamRoomDetailPage from "@/pages/k/ManageExamRoomDetailPage";
import ExamRoomSessionAnalyticsPage from "@/pages/k/ExamRoomSessionAnalyticsPage";
import MyExamsPage from "@/pages/k/MyExamsPage";
import QuizPracticePage from "@/pages/k/QuizPracticePage";
import StudyRoomListPage from "@/pages/study-room/StudyRoomListPage";
import StudyRoomPage from "@/pages/study-room/StudyRoomPage";
import { PublicLayout } from "@/routes/layouts/PublicLayout";
import { AuthLayout } from "@/routes/layouts/AuthLayout";
import { KLayout } from "@/routes/layouts/KLayout";
import { ExamSessionLayout } from "@/routes/layouts/ExamSessionLayout";
import { AdminLayout } from "@/routes/layouts/AdminLayout";
import { PublicRoute } from "@/routes/guards/PublicRoute";
import { ProtectedRoute } from "@/routes/guards/ProtectedRoute";
import { RequirePermission } from "@/routes/guards/RequirePermission";
import { AdminRoute } from "@/routes/guards/AdminRoute";
import { FeatureRoute } from "@/routes/guards/FeatureRoute";
import ForbiddenPage from "@/pages/errors/ForbiddenPage";
import { registerRoleScopeResetter } from "@/stores/useAuthStore";
import { resetRoleScopedState } from "@/stores/reset-role-scoped-state";
import type { PageKey } from "@/lib/page-keys";
import type { Permission } from "@/types/permissions.generated";
import type { ReactNode } from "react";
import AdminOverviewPage from "@/pages/admin/AdminOverviewPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminRolesPage from "@/pages/admin/AdminRolesPage";
import AdminLogsPage from "@/pages/admin/AdminLogsPage";
import AdminAuditPage from "@/pages/admin/AdminAuditPage";
import AdminStatsPage from "@/pages/admin/AdminStatsPage";
import AdminWordFamilyPage from "@/pages/admin/AdminWordFamilyPage";
import AdminPageConfigPage from "@/pages/admin/AdminPageConfigPage";
import WordFamilyPage from "@/pages/k/WordFamilyPage";
import WordFamilyCategoryPage from "@/pages/k/WordFamilyCategoryPage";
import WordFamilyDetailPage from "@/pages/k/WordFamilyDetailPage";

import { useTranslation } from "react-i18next";

function NotFoundPage() {
  const { t } = useTranslation("common");
  return (
    <div className="flex min-h-screen items-center justify-center p-4 text-center">
      <div>
        <h1 className="text-3xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">{t("notFound")}</p>
      </div>
    </div>
  );
}

// The auth store clears role-scoped caches on a role change / logout; the
// reset list lives in stores/reset-role-scoped-state.ts (wired here to avoid an import cycle).
registerRoleScopeResetter(resetRoleScopedState);

interface Guard {
  permission?: Permission;
  anyOf?: readonly Permission[];
  pageKey?: PageKey;
  /** Wrap the page in the dashboard layout (default true). */
  layout?: boolean;
}

/** Auth + permission (+ page flag) around a page. Every non-public route goes through this. */
function guarded(page: ReactNode, { permission, anyOf, pageKey, layout = true }: Guard = {}) {
  const featured = pageKey ? <FeatureRoute pageKey={pageKey}>{page}</FeatureRoute> : page;
  return (
    <RequirePermission permission={permission} anyOf={anyOf}>
      {layout ? <KLayout>{featured}</KLayout> : featured}
    </RequirePermission>
  );
}

function publicPage(page: ReactNode) {
  return <PublicLayout>{page}</PublicLayout>;
}

function authPage(page: ReactNode) {
  return (
    <PublicRoute>
      <AuthLayout>{page}</AuthLayout>
    </PublicRoute>
  );
}

function adminPage(page: ReactNode, permission: Permission) {
  return <RequirePermission permission={permission}>{page}</RequirePermission>;
}

export const router = createBrowserRouter([
  { path: "/", element: publicPage(<HomePage />) },
  { path: "/about", element: publicPage(<AboutPage />) },
  { path: "/contact", element: publicPage(<ContactPage />) },
  { path: "/terms", element: publicPage(<TermsPage />) },
  { path: "/privacy", element: publicPage(<PrivacyPage />) },
  { path: "/cookies", element: publicPage(<CookiesPage />) },
  { path: "/security", element: publicPage(<SecurityPage />) },
  { path: "/login", element: authPage(<LoginPage />) },
  { path: "/register", element: authPage(<RegisterPage />) },
  { path: "/forgot-password", element: authPage(<ForgotPasswordPage />) },
  { path: "/reset-password", element: authPage(<ResetPasswordPage />) },
  { path: "/403", element: <ProtectedRoute><ForbiddenPage /></ProtectedRoute> },
  { path: "/k", element: guarded(<KRootRedirect />) },
  { path: "/k/profile", element: guarded(<ProfilePage />) },
  { path: "/k/verify", element: guarded(<VerifyPage />) },
  { path: "/k/my-materials", element: guarded(<MyMaterialsPage />, { permission: "flashcard:study", pageKey: "my-materials" }) },
  { path: "/k/flash-card", element: guarded(<FlashcardsPage />, { permission: "flashcardset:manage", pageKey: "flash-card" }) },
  { path: "/k/history", element: guarded(<HistoryPage />, { anyOf: ["ai:generate", "exam:take"], pageKey: "history" }) },
  { path: "/k/history/exam", element: guarded(<ExamHistoryPage />, { permission: "exam:take", pageKey: "history" }) },
  { path: "/k/history/pdf", element: guarded(<PDFHistoryPage />, { permission: "ai:generate", pageKey: "history" }) },
  {
    path: "/study-flashcard/:id",
    element: guarded(<FlashcardStudyPage />, { anyOf: ["flashcard:study", "flashcardset:manage"], layout: false }),
  },
  {
    path: "/exam-session/:id",
    element: (
      <ExamSessionLayout>
        <ExamSessionPage />
      </ExamSessionLayout>
    ),
  },
  { path: "/exam-session/:id/quiz", element: guarded(<ExamQuizPage />, { permission: "exam:take", layout: false }) },
  { path: "/k/manage-exam", element: guarded(<ManageExamPage />, { permission: "quizset:manage", pageKey: "manage-exam" }) },
  { path: "/k/manage-quiz-set/:id", element: guarded(<ManageQuizSetDetailPage />, { permission: "quizset:manage", pageKey: "manage-exam" }) },
  // Owner preview (quizset:manage) is decided by the backend.
  { path: "/k/practice-quiz/:id", element: guarded(<QuizPracticePage />, { anyOf: ["quiz:practice", "quizset:manage"] }) },
  { path: "/k/manage-flashcard-set/:id", element: guarded(<ManageFlashcardSetDetailPage />, { permission: "flashcardset:manage", pageKey: "flash-card" }) },
  { path: "/k/ai-tool", element: guarded(<AIToolPage />, { permission: "ai:generate", pageKey: "ai-tool" }) },
  { path: "/k/manage-exam-room", element: guarded(<ManageExamRoomPage />, { permission: "exam_room:manage", pageKey: "manage-exam-room" }) },
  { path: "/k/manage-exam-room/:id", element: guarded(<ManageExamRoomDetailPage />, { permission: "exam_room:manage", pageKey: "manage-exam-room" }) },
  {
    path: "/k/manage-exam-room/:id/session/:sessionId",
    element: guarded(<ExamRoomSessionAnalyticsPage />, { permission: "exam_result:view", pageKey: "manage-exam-room" }),
  },
  { path: "/k/my-exams", element: guarded(<MyExamsPage />, { permission: "exam:take", pageKey: "my-exams" }) },
  { path: "/k/study-room", element: guarded(<StudyRoomListPage />, { permission: "study_room:join", pageKey: "study-room" }) },
  { path: "/k/study-room/:id", element: guarded(<StudyRoomPage />, { permission: "study_room:join", pageKey: "study-room", layout: false }) },
  { path: "/k/word-family", element: guarded(<WordFamilyPage />, { permission: "word_family:read", pageKey: "word-family" }) },
  { path: "/k/word-family/:slug", element: guarded(<WordFamilyCategoryPage />, { permission: "word_family:read", pageKey: "word-family" }) },
  { path: "/k/word-family/:slug/:rootWord", element: guarded(<WordFamilyDetailPage />, { permission: "word_family:read", pageKey: "word-family" }) },
  {
    path: "/admin",
    element: (
      <AdminRoute>
        <AdminLayout />
      </AdminRoute>
    ),
    children: [
      { index: true, element: adminPage(<AdminOverviewPage />, "stats:read") },
      { path: "stats", element: adminPage(<AdminStatsPage />, "stats:read") },
      { path: "users", element: adminPage(<AdminUsersPage />, "user:manage") },
      { path: "roles", element: adminPage(<AdminRolesPage />, "role:assign") },
      { path: "logs", element: adminPage(<AdminLogsPage />, "logs:read") },
      { path: "audit", element: adminPage(<AdminAuditPage />, "audit:read") },
      { path: "word-family", element: adminPage(<AdminWordFamilyPage />, "word_family:admin") },
      { path: "page-config", element: adminPage(<AdminPageConfigPage />, "page_config:manage") },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
