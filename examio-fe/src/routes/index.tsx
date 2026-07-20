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
import SubscriptionPage from "@/pages/k/SubscriptionPage";
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
import StudyRoomListPage from "@/pages/study-room/StudyRoomListPage";
import StudyRoomPage from "@/pages/study-room/StudyRoomPage";
import { PublicLayout } from "@/routes/layouts/PublicLayout";
import { AuthLayout } from "@/routes/layouts/AuthLayout";
import { KLayout } from "@/routes/layouts/KLayout";
import { ExamSessionLayout } from "@/routes/layouts/ExamSessionLayout";
import { AdminLayout } from "@/routes/layouts/AdminLayout";
import { PublicRoute } from "@/routes/guards/PublicRoute";
import { ProtectedRoute } from "@/routes/guards/ProtectedRoute";
import { AdminRoute } from "@/routes/guards/AdminRoute";
import { FeatureRoute } from "@/routes/guards/FeatureRoute";
import AdminOverviewPage from "@/pages/admin/AdminOverviewPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminFinancePage from "@/pages/admin/AdminFinancePage";
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

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <PublicLayout>
        <HomePage />
      </PublicLayout>
    ),
  },
  {
    path: "/about",
    element: (
      <PublicLayout>
        <AboutPage />
      </PublicLayout>
    ),
  },
  {
    path: "/contact",
    element: (
      <PublicLayout>
        <ContactPage />
      </PublicLayout>
    ),
  },
  {
    path: "/terms",
    element: (
      <PublicLayout>
        <TermsPage />
      </PublicLayout>
    ),
  },
  {
    path: "/privacy",
    element: (
      <PublicLayout>
        <PrivacyPage />
      </PublicLayout>
    ),
  },
  {
    path: "/cookies",
    element: (
      <PublicLayout>
        <CookiesPage />
      </PublicLayout>
    ),
  },
  {
    path: "/security",
    element: (
      <PublicLayout>
        <SecurityPage />
      </PublicLayout>
    ),
  },
  {
    path: "/login",
    element: (
      <PublicRoute>
        <AuthLayout>
          <LoginPage />
        </AuthLayout>
      </PublicRoute>
    ),
  },
  {
    path: "/register",
    element: (
      <PublicRoute>
        <AuthLayout>
          <RegisterPage />
        </AuthLayout>
      </PublicRoute>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <PublicRoute>
        <AuthLayout>
          <ForgotPasswordPage />
        </AuthLayout>
      </PublicRoute>
    ),
  },
  {
    path: "/reset-password",
    element: (
      <PublicRoute>
        <AuthLayout>
          <ResetPasswordPage />
        </AuthLayout>
      </PublicRoute>
    ),
  },
  {
    path: "/k",
    element: (
      <ProtectedRoute>
        <KLayout>
          <KRootRedirect />
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/profile",
    element: (
      <ProtectedRoute>
        <KLayout>
          <ProfilePage />
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/verify",
    element: (
      <ProtectedRoute>
        <KLayout>
          <VerifyPage />
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/subscription",
    element: (
      <ProtectedRoute>
        <KLayout>
          <SubscriptionPage />
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/my-materials",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="my-materials">
            <MyMaterialsPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/flash-card",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="flash-card">
            <FlashcardsPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/history",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="history">
            <HistoryPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/history/exam",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="history">
            <ExamHistoryPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/history/pdf",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="history">
            <PDFHistoryPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/study-flashcard/:id",
    element: <FlashcardStudyPage />,
  },
  {
    path: "/exam-session/:id",
    element: (
      <ExamSessionLayout>
        <ExamSessionPage />
      </ExamSessionLayout>
    ),
  },
  {
    path: "/exam-session/:id/quiz",
    element: <ExamQuizPage />,
  },
  {
    path: "/k/manage-exam",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="manage-exam">
            <ManageExamPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/manage-quiz-set/:id",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="manage-exam">
            <ManageQuizSetDetailPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/manage-flashcard-set/:id",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="flash-card">
            <ManageFlashcardSetDetailPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/ai-tool",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="ai-tool">
            <AIToolPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/manage-exam-room",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="manage-exam-room">
            <ManageExamRoomPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/manage-exam-room/:id",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="manage-exam-room">
            <ManageExamRoomDetailPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/manage-exam-room/:id/session/:sessionId",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="manage-exam-room">
            <ExamRoomSessionAnalyticsPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/my-exams",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="my-exams">
            <MyExamsPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/study-room",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="study-room">
            <StudyRoomListPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/study-room/:id",
    element: (
      <ProtectedRoute>
        <StudyRoomPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/word-family",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="word-family">
            <WordFamilyPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/word-family/:slug",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="word-family">
            <WordFamilyCategoryPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/k/word-family/:slug/:rootWord",
    element: (
      <ProtectedRoute>
        <KLayout>
          <FeatureRoute pageKey="word-family">
            <WordFamilyDetailPage />
          </FeatureRoute>
        </KLayout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/admin",
    element: (
      <AdminRoute>
        <AdminLayout />
      </AdminRoute>
    ),
    children: [
      { index: true, element: <AdminOverviewPage /> },
      { path: "stats", element: <AdminStatsPage /> },
      { path: "users", element: <AdminUsersPage /> },
      { path: "finance", element: <AdminFinancePage /> },
      { path: "logs", element: <AdminLogsPage /> },
      { path: "audit", element: <AdminAuditPage /> },
      { path: "word-family", element: <AdminWordFamilyPage /> },
      { path: "page-config", element: <AdminPageConfigPage /> },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);
