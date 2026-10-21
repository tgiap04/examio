import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePageConfigStore } from "@/stores/usePageConfigStore";
import { resolveLandingPath } from "@/lib/rbac/landing-path";

export default function KRootRedirect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, initializing, user, permissions } = useAuthStore();
  const pageMap = usePageConfigStore((s) => s.pages);

  useEffect(() => {
    if (initializing) {
      return;
    }

    if (!isAuthenticated || !user) {
      navigate("/login", { replace: true });
      return;
    }

    navigate(
      resolveLandingPath({
        role: user.role,
        isSystemAdmin: user.isSystemAdmin,
        permissions,
        pageMap,
        from: searchParams.get("from"),
      }),
      { replace: true },
    );
  }, [initializing, isAuthenticated, user, permissions, pageMap, searchParams, navigate]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  );
}
