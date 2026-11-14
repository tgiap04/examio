import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";
import { setRedirectBackTarget } from "@/lib/authRedirect";
import { guardDecision } from "@/lib/rbac/guard-decision";
import { SessionUnavailable } from "@/components/organisms/SessionUnavailable";
import type { Permission } from "@/types/permissions.generated";

interface RequirePermissionProps extends PropsWithChildren {
  /** Every route needs one of the two (anyOf = OR). */
  permission?: Permission;
  anyOf?: readonly Permission[];
}

/**
 * Auth + permission gate. Waits for the session to hydrate (no flash of
 * forbidden content), sends anonymous users to login and users without the
 * permission to /403. The backend enforces the same rules; this is UX only.
 */
export function RequirePermission({ permission, anyOf, children }: RequirePermissionProps) {
  const location = useLocation();
  const { isAuthenticated, initializing, permissions, sessionUnavailable } = useAuthStore();
  const required = anyOf ?? (permission ? [permission] : []);
  const allowed = required.length === 0 || required.some((p) => permissions.includes(p));
  const decision = guardDecision({ initializing, isAuthenticated, sessionUnavailable, allowed });

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

  if (decision === "forbidden") {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}
