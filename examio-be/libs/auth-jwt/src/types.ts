import type { Role } from './permissions';

/** A verified end-user access token. `id` is the token `sub`. */
export interface AuthUser {
    kind: 'user';
    id: string;
    /** Session id (`sid`). */
    sid: string;
    roles: Role[];
    emailVerified: boolean;
    /** Authz version (`av`) the token was signed with. */
    av: number;
}

/** A verified service token (`sub = svc:<name>`, `roles = ["SERVICE"]`). */
export interface ServiceCaller {
    kind: 'service';
    name: string;
}

export type Principal = AuthUser | ServiceCaller;

export const SERVICE_ROLE = 'SERVICE';
export const SERVICE_SUBJECT_PREFIX = 'svc:';
export const ACCESS_TOKEN_TYP = 'at+jwt';
