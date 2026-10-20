import type { Actor } from './test-tokens';

export type Row = {
    name: string;
    method: 'get' | 'post' | 'put' | 'delete';
    path: string;
    body?: object;
    /**
     * Per actor: the exact status, '2xx', or 'gate' = the guards let it through
     * (the handler itself may still answer 400 for the empty stub body / no file).
     */
    expect: Record<Actor, number | '2xx' | 'gate'>;
    /** The resource is owned by the caller (owner-or-permission rows). */
    ownedByCaller?: boolean;
};

const SID = 'ses_1';
export const rows: Record<'exam' | 'finance' | 'admin', Row[]> = {
    exam: [
        {
            name: 'POST /quizsets',
            method: 'post',
            path: '/quizsets',
            body: { title: 'q' },
            expect: {
                STUDENT: 403,
                TEACHER: '2xx',
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: '2xx',
            },
        },
        {
            name: 'GET /flashcardsets/study/:id (granted set, not owned)',
            method: 'get',
            path: '/flashcardsets/study/fs1',
            expect: {
                STUDENT: 200,
                TEACHER: 403,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 403,
            },
        },
        {
            name: 'GET /flashcardsets/study/:id (own set: owner passes without flashcard:study)',
            method: 'get',
            path: '/flashcardsets/study/fs1',
            ownedByCaller: true,
            expect: {
                STUDENT: 200,
                TEACHER: 200,
                ADMIN_ONLY: 200,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'POST /flashcardsets/study/:id/verify-code',
            method: 'post',
            path: '/flashcardsets/study/fs1/verify-code',
            body: { accessCode: '123456' },
            expect: {
                STUDENT: '2xx',
                TEACHER: 403,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 403,
            },
        },
        {
            name: 'POST /flashcardsets/study/:id/with-code',
            method: 'post',
            path: '/flashcardsets/study/fs1/with-code',
            body: { accessCode: '123456' },
            expect: {
                STUDENT: '2xx',
                TEACHER: 403,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 403,
            },
        },
        {
            name: 'POST /examattempts/start',
            method: 'post',
            path: '/examattempts/start',
            body: { examSessionId: 's' },
            expect: {
                STUDENT: '2xx',
                TEACHER: 403,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 403,
            },
        },
        {
            name: 'GET /examsessions/study/:id',
            method: 'get',
            path: '/examsessions/study/s1',
            expect: {
                STUDENT: 200,
                TEACHER: 403,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 403,
            },
        },
        {
            name: 'GET /examattempts/list-by-session/:sid',
            method: 'get',
            path: `/examattempts/list-by-session/${SID}`,
            expect: {
                STUDENT: 403,
                TEACHER: 200,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'POST /ai/generate-from-file',
            method: 'post',
            path: '/ai/generate-from-file',
            body: {},
            expect: {
                STUDENT: 403,
                TEACHER: 'gate',
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 'gate',
            },
        },
        {
            name: 'POST /ai-chat',
            method: 'post',
            path: '/ai-chat',
            body: {},
            expect: {
                STUDENT: 403,
                TEACHER: '2xx',
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: '2xx',
            },
        },
        {
            name: 'POST /studyrooms',
            method: 'post',
            path: '/studyrooms',
            body: { name: 'r' },
            expect: {
                STUDENT: 403,
                TEACHER: '2xx',
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: '2xx',
            },
        },
        {
            name: 'POST /studyrooms/join',
            method: 'post',
            path: '/studyrooms/join',
            body: { inviteCode: '123456' },
            expect: {
                STUDENT: '2xx',
                TEACHER: '2xx',
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: '2xx',
            },
        },
        {
            name: 'GET /word-family/saved',
            method: 'get',
            path: '/word-family/saved',
            expect: {
                STUDENT: 200,
                TEACHER: 200,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'POST /word-family/generate',
            method: 'post',
            path: '/word-family/generate',
            body: {},
            expect: {
                STUDENT: 403,
                TEACHER: 'gate',
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 'gate',
            },
        },
        {
            name: 'GET /examsessions/users/search?q=ab',
            method: 'get',
            path: '/examsessions/users/search?q=ab',
            expect: {
                STUDENT: 403,
                TEACHER: 400,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 400,
            },
        },
        {
            name: 'GET /flashcardsets/users/search?q=abc',
            method: 'get',
            path: '/flashcardsets/users/search?q=abc',
            expect: {
                STUDENT: 403,
                TEACHER: 200,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'POST /word-family/categories (admin)',
            method: 'post',
            path: '/word-family/categories',
            body: {},
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: 'gate',
                TEACHER_ADMIN: 'gate',
            },
        },
        {
            name: 'GET /student/recent-exams',
            method: 'get',
            path: '/student/recent-exams',
            expect: {
                STUDENT: 200,
                TEACHER: 403,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 403,
            },
        },
        {
            name: 'POST /r2/image',
            method: 'post',
            path: '/r2/image',
            expect: {
                STUDENT: 403,
                TEACHER: 'gate',
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 'gate',
            },
        },
    ],
    finance: [
        {
            name: 'GET /wallet/info',
            method: 'get',
            path: '/wallet/info',
            expect: {
                STUDENT: 403,
                TEACHER: 200,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'GET /payment/history',
            method: 'get',
            path: '/payment/history',
            expect: {
                STUDENT: 403,
                TEACHER: 200,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'GET /payment/subscription',
            method: 'get',
            path: '/payment/subscription',
            expect: {
                STUDENT: 403,
                TEACHER: 200,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'GET /payment/subscription/plans (public)',
            method: 'get',
            path: '/payment/subscription/plans',
            expect: {
                STUDENT: 200,
                TEACHER: 200,
                ADMIN_ONLY: 200,
                TEACHER_ADMIN: 200,
            },
        },
    ],
    admin: [
        {
            name: 'GET /admin/users',
            method: 'get',
            path: '/admin/users',
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: 200,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'POST /admin/users/:id/grant-admin',
            method: 'post',
            path: '/admin/users/u1/grant-admin',
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: '2xx',
                TEACHER_ADMIN: '2xx',
            },
        },
        {
            name: 'POST /admin/finance/credit',
            method: 'post',
            path: '/admin/finance/credit',
            body: {},
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: 'gate',
                TEACHER_ADMIN: 'gate',
            },
        },
        {
            name: 'GET /admin/audit',
            method: 'get',
            path: '/admin/audit',
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: 200,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'GET /admin/page-config',
            method: 'get',
            path: '/admin/page-config',
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: 200,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'GET /admin/stats/overview',
            method: 'get',
            path: '/admin/stats/overview',
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: 200,
                TEACHER_ADMIN: 200,
            },
        },
    ],
};
