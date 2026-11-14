import { useMemo } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Permission } from "@/types/permissions.generated";
import { makeCan, type CanFn } from "@/lib/rbac/can";

/** True when the signed-in session holds `permission` (UX gating only: the backend enforces). */
export function useCan(permission: Permission): boolean {
  return useAuthStore((s) => s.permissions.includes(permission));
}

/** True when the session holds at least one of `permissions`. */
export function useCanAny(permissions: readonly Permission[]): boolean {
  return useAuthStore((s) => permissions.some((p) => s.permissions.includes(p)));
}

/** A stable predicate for filtering lists (sidebar, admin nav). */
export function useCanFn(): CanFn {
  const permissions = useAuthStore((s) => s.permissions);
  return useMemo(() => makeCan(permissions), [permissions]);
}
