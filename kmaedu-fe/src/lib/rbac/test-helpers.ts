import { ROLE_PERMISSIONS, type Permission, type Role } from "@/types/permissions.generated";

/** Permissions a session would carry for the given roles (mirrors `permissionsOf` in the backend). */
export function permissionsForRoles(roles: readonly Role[]): Permission[] {
  const out = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) out.add(permission);
  }
  return [...out];
}
