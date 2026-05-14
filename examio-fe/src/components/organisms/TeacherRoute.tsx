"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";

export function TeacherRoute({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { isAuthenticated, initializing } = useAuthStore();

  useEffect(() => {
    if (!initializing) {
      if (!isAuthenticated) {
        navigate("/login", { replace: true });
      }
    }
  }, [isAuthenticated, initializing, navigate]);

  // Show nothing while checking authentication
  if (initializing || !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
