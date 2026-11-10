import type { PropsWithChildren } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";
import { setRedirectBackTarget } from "@/lib/authRedirect";
import { guardDecision } from "@/lib/rbac/guard-decision";
import { SessionUnavailable } from "@/components/organisms/SessionUnavailable";

export function ProtectedRoute({ children }: PropsWithChildren) {
  const location = useLocation();
  const { isAuthenticated, initializing, sessionUnavailable } = useAuthStore();
  const decision = guardDecision({ initializing, isAuthenticated, sessionUnavailable, allowed: true });

  if (decision === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  if (decision === "unavailable") {
    return <SessionUnavailable />;
  }

  if (decision === "login") {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    setRedirectBackTarget(returnTo);
    return <Navigate to={`/login?from=${encodeURIComponent(returnTo)}`} replace />;
  }

  return children ?? <Outlet />;
}
