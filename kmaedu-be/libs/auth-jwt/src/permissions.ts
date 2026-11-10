/**
 * Permission catalog v1 (pure TypeScript: phase 09 generates the FE union from
 * this file, so it must not import anything).
 * Roles hold a FIXED permission set; there is no wildcard and nothing about
 * permissions travels inside the token (only `roles` does).
 */
export const PERMISSIONS = {
    FLASHCARD_STUDY: 'flashcard:study',
    QUIZ_PRACTICE: 'quiz:practice',
    EXAM_TAKE: 'exam:take',
    STUDY_ROOM_JOIN: 'study_room:join',
    STUDY_ROOM_CREATE: 'study_room:create',
    WORD_FAMILY_READ: 'word_family:read',
    WORD_FAMILY_SAVE: 'word_family:save',
    WORD_FAMILY_GENERATE: 'word_family:generate',
    WORD_FAMILY_ADMIN: 'word_family:admin',
    QUIZSET_MANAGE: 'quizset:manage',
    FLASHCARDSET_MANAGE: 'flashcardset:manage',
    EXAM_ROOM_MANAGE: 'exam_room:manage',
    EXAM_SESSION_MANAGE: 'exam_session:manage',
    EXAM_RESULT_VIEW: 'exam_result:view',
    CONTENT_SHARE: 'content:share',
    USER_SEARCH: 'user:search',
    AI_GENERATE: 'ai:generate',
    AI_CHAT_USE: 'ai_chat:use',
    DOCUMENT_UPLOAD: 'document:upload',
    ADMIN_ACCESS: 'admin:access',
    USER_MANAGE: 'user:manage',
    ROLE_ASSIGN: 'role:assign',
    STATS_READ: 'stats:read',
    LOGS_READ: 'logs:read',
    AUDIT_READ: 'audit:read',
    PAGE_CONFIG_MANAGE: 'page_config:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Roles that carry user permissions. `SERVICE` is a token kind, not a role here. */
export type Role = 'STUDENT' | 'TEACHER' | 'SYSTEM_ADMIN';

const P = PERMISSIONS;

export const ROLE_PERMISSIONS = {
    STUDENT: [
        P.FLASHCARD_STUDY,
        P.QUIZ_PRACTICE,
        P.EXAM_TAKE,
        P.STUDY_ROOM_JOIN,
        P.WORD_FAMILY_READ,
        P.WORD_FAMILY_SAVE,
    ],
    TEACHER: [
        P.QUIZSET_MANAGE,
        P.FLASHCARDSET_MANAGE,
        P.EXAM_ROOM_MANAGE,
        P.EXAM_SESSION_MANAGE,
        P.EXAM_RESULT_VIEW,
        P.CONTENT_SHARE,
        P.USER_SEARCH,
        P.AI_GENERATE,
        P.AI_CHAT_USE,
        P.DOCUMENT_UPLOAD,
        P.STUDY_ROOM_CREATE,
        P.STUDY_ROOM_JOIN,
        P.WORD_FAMILY_READ,
        P.WORD_FAMILY_GENERATE,
        P.WORD_FAMILY_SAVE,
    ],
    SYSTEM_ADMIN: [
        P.ADMIN_ACCESS,
        P.USER_MANAGE,
        P.ROLE_ASSIGN,
        P.STATS_READ,
        P.LOGS_READ,
        P.AUDIT_READ,
        P.PAGE_CONFIG_MANAGE,
        P.WORD_FAMILY_ADMIN,
    ],
} as const satisfies Record<Role, readonly Permission[]>;

export function isRole(value: string): value is Role {
    return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, value);
}

/** Union of the permissions of every known role in `roles` (unknown ones are ignored). */
export function permissionsOf(roles: readonly string[]): Permission[] {
    const out = new Set<Permission>();
    for (const role of roles) {
        if (!isRole(role)) continue;
        for (const permission of ROLE_PERMISSIONS[role]) out.add(permission);
    }
    return [...out];
}

/** AND semantics: every required permission must be held. */
export function hasPermission(
    roles: readonly string[],
    ...required: Permission[]
): boolean {
    if (required.length === 0) return true;
    const held = new Set<Permission>(permissionsOf(roles));
    return required.every((permission) => held.has(permission));
}

/** Token `roles` of an account: its base role, plus SYSTEM_ADMIN when flagged. */
export function rolesFor(
    role: 'STUDENT' | 'TEACHER',
    isSystemAdmin: boolean
): Role[] {
    return isSystemAdmin ? [role, 'SYSTEM_ADMIN'] : [role];
}
