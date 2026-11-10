import type { PropsWithChildren } from "react";
import { RequirePermission } from "@/routes/guards/RequirePermission";

/** Admin console shell: needs `admin:access` (each child route adds its own permission). */
export function AdminRoute({ children }: PropsWithChildren) {
  return <RequirePermission permission="admin:access">{children}</RequirePermission>;
}
