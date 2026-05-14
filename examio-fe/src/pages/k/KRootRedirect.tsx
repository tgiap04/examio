import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";

export default function KRootRedirect() {
  const navigate = useNavigate();
  const { isAuthenticated, initializing } = useAuthStore();

  useEffect(() => {
    if (initializing) {
      return;
    }

    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }

    navigate("/k/my-materials", { replace: true });
  }, [initializing, isAuthenticated, navigate]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  );
}
