import type { Permission } from "@/types/permissions.generated";

export type CanFn = (permission: Permission) => boolean;

/** Membership predicate over the permissions the server put in the session. */
export function makeCan(permissions: readonly Permission[]): CanFn {
  const held = new Set<Permission>(permissions);
  return (permission) => held.has(permission);
}

/** OR semantics; an empty list is never satisfied. */
export function makeCanAny(can: CanFn): (permissions: readonly Permission[]) => boolean {
  return (permissions) => permissions.some(can);
}
