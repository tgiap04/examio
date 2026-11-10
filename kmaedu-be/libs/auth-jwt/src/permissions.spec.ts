import {
    PERMISSIONS,
    rolesFor,
    ROLE_PERMISSIONS,
    hasPermission,
    permissionsOf,
} from './permissions';

describe('permission catalog', () => {
    it('matches the v1 catalog exactly (STUDENT learning-only)', () => {
        expect([...ROLE_PERMISSIONS.STUDENT].sort()).toEqual(
            [
                'flashcard:study',
                'quiz:practice',
                'exam:take',
                'study_room:join',
                'word_family:read',
                'word_family:save',
            ].sort()
        );
    });

    it('matches the v1 catalog exactly (TEACHER incl. word_family:save)', () => {
        expect([...ROLE_PERMISSIONS.TEACHER].sort()).toEqual(
            [
                'quizset:manage',
                'flashcardset:manage',
                'exam_room:manage',
                'exam_session:manage',
                'exam_result:view',
                'content:share',
                'user:search',
                'ai:generate',
                'ai_chat:use',
                'document:upload',
                'study_room:create',
                'study_room:join',
                'word_family:read',
                'word_family:generate',
                'word_family:save',
            ].sort()
        );
    });

    it('matches the v1 catalog exactly (SYSTEM_ADMIN, no wildcard)', () => {
        expect([...ROLE_PERMISSIONS.SYSTEM_ADMIN].sort()).toEqual(
            [
                'admin:access',
                'user:manage',
                'role:assign',
                'stats:read',
                'logs:read',
                'audit:read',
                'page_config:manage',
                'word_family:admin',
            ].sort()
        );
        expect(ROLE_PERMISSIONS.SYSTEM_ADMIN).not.toContain('*');
    });

    it('has no wallet, subscription or finance permission (school edition)', () => {
        const catalog = new Set<string>(Object.values(PERMISSIONS));
        for (const p of [
            'wallet:use',
            'subscription:manage',
            'finance:admin',
        ]) {
            expect(catalog.has(p)).toBe(false);
            for (const perms of Object.values(ROLE_PERMISSIONS)) {
                expect(perms).not.toContain(p);
            }
        }
    });

    it('TEACHER lacks the student-only learning permissions', () => {
        for (const p of ['flashcard:study', 'quiz:practice', 'exam:take']) {
            expect(ROLE_PERMISSIONS.TEACHER).not.toContain(p);
        }
    });

    it('SYSTEM_ADMIN holds no TEACHER or STUDENT permission', () => {
        const admin = new Set<string>(ROLE_PERMISSIONS.SYSTEM_ADMIN);
        for (const p of [
            ...ROLE_PERMISSIONS.TEACHER,
            ...ROLE_PERMISSIONS.STUDENT,
        ]) {
            expect(admin.has(p)).toBe(false);
        }
    });

    it('every role permission is a catalog key', () => {
        const keys = new Set<string>(Object.values(PERMISSIONS));
        for (const perms of Object.values(ROLE_PERMISSIONS)) {
            for (const p of perms) expect(keys.has(p)).toBe(true);
        }
    });

    it('SERVICE is not a role with permissions', () => {
        expect(Object.keys(ROLE_PERMISSIONS)).not.toContain('SERVICE');
        expect(permissionsOf(['SERVICE'])).toEqual([]);
        expect(hasPermission(['SERVICE'], 'flashcard:study')).toBe(false);
    });
});

describe('permissionsOf / hasPermission', () => {
    it('unions the permissions of combined roles without duplicates', () => {
        const perms = permissionsOf(['TEACHER', 'SYSTEM_ADMIN']);
        expect(perms).toContain('word_family:save');
        expect(perms).toContain('role:assign');
        expect(new Set(perms).size).toBe(perms.length);
    });

    it('ignores unknown roles', () => {
        expect(permissionsOf(['NOPE'])).toEqual([]);
    });

    it('uses AND semantics', () => {
        expect(
            hasPermission(['TEACHER'], 'quizset:manage', 'ai:generate')
        ).toBe(true);
        expect(
            hasPermission(['TEACHER'], 'quizset:manage', 'role:assign')
        ).toBe(false);
    });

    it('an empty requirement is satisfied by any role set', () => {
        expect(hasPermission(['STUDENT'])).toBe(true);
    });
});

describe('rolesFor', () => {
    it('is the base role, plus SYSTEM_ADMIN when flagged', () => {
        expect(rolesFor('STUDENT', false)).toEqual(['STUDENT']);
        expect(rolesFor('TEACHER', true)).toEqual(['TEACHER', 'SYSTEM_ADMIN']);
    });
});
