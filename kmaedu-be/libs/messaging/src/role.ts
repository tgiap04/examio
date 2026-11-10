export type ProcessRole = 'api' | 'worker';

const ROLES: readonly ProcessRole[] = ['api', 'worker'];

/**
 * `ROLE` = `api` | `worker` | `api,worker` (default `api,worker` until the
 * containers are split in phase 16).
 */
export function parseRoles(value: string | undefined = process.env.ROLE): Set<ProcessRole> {
    if (!value || value.trim() === '') return new Set(ROLES);
    const parsed = new Set<ProcessRole>();
    for (const part of value.split(',')) {
        const role = part.trim().toLowerCase();
        if (!ROLES.includes(role as ProcessRole)) {
            throw new Error(`Invalid ROLE "${part.trim()}": expected api, worker or api,worker`);
        }
        parsed.add(role as ProcessRole);
    }
    return parsed;
}
