import type { Permission } from "@/types/permissions.generated";
import type { PageKey } from "@/lib/page-keys";
import { normalizeReturnPath } from "@/lib/authRedirect";
import { makeCan } from "./can";
import { filterNav } from "./nav-items";

export interface LandingInput {
  role: "STUDENT" | "TEACHER";
  isSystemAdmin: boolean;
  permissions: readonly Permission[];
  pageMap: Partial<Record<PageKey, boolean>>;
  /** The `from` query param (already decoded). */
  from?: string | null;
}

const FALLBACK = "/k/profile";

/** A same-origin path other than the bare `/k` landing, else null. */
function safeFrom(from: string | null | undefined): string | null {
  if (!from) return null;
  const normalized = normalizeReturnPath(from);
  // normalizeReturnPath answers "/k" for anything unsafe (and for "/k" itself).
  return normalized === "/k" ? null : normalized;
}

/** Where `/k` sends a signed-in user: `from`, else the role landing, else the first visible item. */
export function resolveLandingPath(input: LandingInput): string {
  const from = safeFrom(input.from);
  if (from) return from;

  const adminOnly = input.isSystemAdmin && input.role === "STUDENT";
  const target = input.role === "TEACHER" ? "/k/ai-tool" : adminOnly ? "/admin" : "/k/my-materials";

  const visible = filterNav(makeCan(input.permissions), input.pageMap);
  if (visible.some((item) => item.href === target)) return target;
  return visible[0]?.href ?? FALLBACK;
}
