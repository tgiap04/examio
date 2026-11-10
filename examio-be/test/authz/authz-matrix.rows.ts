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
export const rows: Record<'content' | 'assessment' | 'studyroom' | 'vocabulary' | 'document' | 'aichat' | 'finance' | 'admin', Row[]> = {
    content: [
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
            name: 'GET /ai/recent-uploads (documents over gRPC + generated history)',
            method: 'get',
            path: '/ai/recent-uploads',
            expect: { STUDENT: 403, TEACHER: 200, ADMIN_ONLY: 403, TEACHER_ADMIN: 200 },
        },
        {
            name: 'GET /ai/models',
            method: 'get',
            path: '/ai/models',
            expect: { STUDENT: 403, TEACHER: 200, ADMIN_ONLY: 403, TEACHER_ADMIN: 200 },
        },
        {
            name: 'POST /ai/regenerate/:id',
            method: 'post',
            path: '/ai/regenerate/u1',
            body: {},
            expect: { STUDENT: 403, TEACHER: '2xx', ADMIN_ONLY: 403, TEACHER_ADMIN: '2xx' },
        },
        {
            name: 'GET /ai/job/:id',
            method: 'get',
            path: '/ai/job/j1',
            expect: { STUDENT: 403, TEACHER: 200, ADMIN_ONLY: 403, TEACHER_ADMIN: 200 },
        },
        {
            name: 'DELETE /ai/job/:id',
            method: 'delete',
            path: '/ai/job/j1',
            expect: { STUDENT: 403, TEACHER: 200, ADMIN_ONLY: 403, TEACHER_ADMIN: 200 },
        },
        {
            name: 'GET /ai/upload/:id/history',
            method: 'get',
            path: '/ai/upload/u1/history',
            expect: { STUDENT: 403, TEACHER: 200, ADMIN_ONLY: 403, TEACHER_ADMIN: 200 },
        },
        {
            name: 'POST /word-family/:id/to-flashcard',
            method: 'post',
            path: '/word-family/wf1/to-flashcard',
            body: {},
            expect: {
                STUDENT: 403,
                TEACHER: 'gate',
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 'gate',
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
            name: 'GET /quiz-practice/sets',
            method: 'get',
            path: '/quiz-practice/sets',
            expect: {
                STUDENT: 200,
                TEACHER: 403,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 403,
            },
        },
        {
            name: 'GET /quiz-practice/sets/:id/access (public)',
            method: 'get',
            path: '/quiz-practice/sets/qs1/access',
            expect: {
                STUDENT: 200,
                TEACHER: 200,
                ADMIN_ONLY: 200,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'POST /quiz-practice/sets/:id/unlock',
            method: 'post',
            path: '/quiz-practice/sets/qs1/unlock',
            body: { code: '123456' },
            expect: {
                STUDENT: '2xx',
                TEACHER: 403,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 403,
            },
        },
        {
            name: 'POST /quiz-practice/attempts (granted set, not owned)',
            method: 'post',
            path: '/quiz-practice/attempts',
            body: { quizSetId: 'qs1' },
            expect: {
                STUDENT: '2xx',
                TEACHER: 403,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 403,
            },
        },
        {
            name: 'POST /quiz-practice/attempts (own set: owner passes without quiz:practice)',
            method: 'post',
            path: '/quiz-practice/attempts',
            body: { quizSetId: 'qs1' },
            ownedByCaller: true,
            expect: {
                STUDENT: '2xx',
                TEACHER: '2xx',
                ADMIN_ONLY: '2xx',
                TEACHER_ADMIN: '2xx',
            },
        },
        {
            name: 'GET /quiz-practice/attempts/:id (any verified user; ownership is in the handler)',
            method: 'get',
            path: '/quiz-practice/attempts/a1',
            expect: {
                STUDENT: 200,
                TEACHER: 200,
                ADMIN_ONLY: 200,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'GET /quiz-practice/attempts (history)',
            method: 'get',
            path: '/quiz-practice/attempts?quizSetId=qs1',
            expect: {
                STUDENT: 200,
                TEACHER: 200,
                ADMIN_ONLY: 200,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'GET /quizsets/:id/sharing',
            method: 'get',
            path: '/quizsets/qs1/sharing',
            expect: {
                STUDENT: 403,
                TEACHER: 200,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'PUT /quizsets/:id/sharing',
            method: 'put',
            path: '/quizsets/qs1/sharing',
            body: { isPublic: true },
            expect: {
                STUDENT: 403,
                TEACHER: '2xx',
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: '2xx',
            },
        },
        {
            name: 'POST /quizsets/:id/generate-code',
            method: 'post',
            path: '/quizsets/qs1/generate-code',
            expect: {
                STUDENT: 403,
                TEACHER: '2xx',
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: '2xx',
            },
        },
        {
            name: 'GET /quizsets/users/search?q=abc',
            method: 'get',
            path: '/quizsets/users/search?q=abc',
            expect: {
                STUDENT: 403,
                TEACHER: 200,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'GET /student/recent-flashcards',
            method: 'get',
            path: '/student/recent-flashcards',
            expect: {
                STUDENT: 200,
                TEACHER: 403,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 403,
            },
        },
        {
            name: 'POST /student/pin-flashcard/:id',
            method: 'post',
            path: '/student/pin-flashcard/fs1',
            expect: {
                STUDENT: '2xx',
                TEACHER: 403,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 403,
            },
        },
    ],
    assessment: [
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
            name: 'POST /examsessions/:id/refresh-snapshot',
            method: 'post',
            path: '/examsessions/s1/refresh-snapshot',
            expect: {
                STUDENT: 403,
                TEACHER: 200,
                ADMIN_ONLY: 403,
                TEACHER_ADMIN: 200,
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
    ],
    studyroom: [
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
    ],
    vocabulary: [
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
    ],
    // document-service: every upload route needs `document:upload` (TEACHER only today)
    document: [
        {
            name: 'GET /ai/upload/:id',
            method: 'get',
            path: '/ai/upload/u1',
            expect: { STUDENT: 403, TEACHER: 200, ADMIN_ONLY: 403, TEACHER_ADMIN: 200 },
        },
        {
            name: 'POST /ai/upload',
            method: 'post',
            path: '/ai/upload',
            body: { filename: 'a.pdf', url: 'https://r2/x', mimetype: 'application/pdf', size: 1024, keyR2: 'ai-uploads/u1/a.pdf' },
            expect: { STUDENT: 403, TEACHER: '2xx', ADMIN_ONLY: 403, TEACHER_ADMIN: '2xx' },
        },
        {
            name: 'POST /ai/upload-image',
            method: 'post',
            path: '/ai/upload-image',
            body: { image: 'data' },
            expect: { STUDENT: 403, TEACHER: '2xx', ADMIN_ONLY: 403, TEACHER_ADMIN: '2xx' },
        },
        {
            name: 'POST /ai/quick-upload',
            method: 'post',
            path: '/ai/quick-upload',
            expect: { STUDENT: 403, TEACHER: 'gate', ADMIN_ONLY: 403, TEACHER_ADMIN: 'gate' },
        },
        {
            name: 'POST /r2/image',
            method: 'post',
            path: '/r2/image',
            expect: { STUDENT: 403, TEACHER: 'gate', ADMIN_ONLY: 403, TEACHER_ADMIN: 'gate' },
        },
    ],
    // ai-chat-service: every chat route needs `ai_chat:use` (TEACHER only today); subjects are public.
    // The stream routes are not listed: their stubbed service never writes to the response.
    aichat: [
        { name: 'POST /ai-chat', method: 'post', path: '/ai-chat', body: {}, expect: { STUDENT: 403, TEACHER: '2xx', ADMIN_ONLY: 403, TEACHER_ADMIN: '2xx' } },
        { name: 'GET /ai-chat', method: 'get', path: '/ai-chat', expect: { STUDENT: 403, TEACHER: 200, ADMIN_ONLY: 403, TEACHER_ADMIN: 200 } },
        { name: 'GET /ai-chat/:chatId/exists', method: 'get', path: '/ai-chat/c1/exists', expect: { STUDENT: 403, TEACHER: 200, ADMIN_ONLY: 403, TEACHER_ADMIN: 200 } },
        { name: 'GET /ai-chat/:chatId/messages', method: 'get', path: '/ai-chat/c1/messages', expect: { STUDENT: 403, TEACHER: 200, ADMIN_ONLY: 403, TEACHER_ADMIN: 200 } },
        { name: 'POST /ai-chat/:chatId/message', method: 'post', path: '/ai-chat/c1/message', body: { message: 'hi' }, expect: { STUDENT: 403, TEACHER: '2xx', ADMIN_ONLY: 403, TEACHER_ADMIN: '2xx' } },
        { name: 'DELETE /ai-chat/:chatId', method: 'delete', path: '/ai-chat/c1', expect: { STUDENT: 403, TEACHER: 200, ADMIN_ONLY: 403, TEACHER_ADMIN: 200 } },
        { name: 'DELETE /ai-chat/message/:messageId', method: 'delete', path: '/ai-chat/message/m1', expect: { STUDENT: 403, TEACHER: 200, ADMIN_ONLY: 403, TEACHER_ADMIN: 200 } },
        { name: 'GET /ai-chat/:chatId/documents', method: 'get', path: '/ai-chat/c1/documents', expect: { STUDENT: 403, TEACHER: 200, ADMIN_ONLY: 403, TEACHER_ADMIN: 200 } },
        { name: 'POST /ai-chat/:chatId/documents', method: 'post', path: '/ai-chat/c1/documents', body: { documentId: 'd1', documentName: 'a.pdf' }, expect: { STUDENT: 403, TEACHER: '2xx', ADMIN_ONLY: 403, TEACHER_ADMIN: '2xx' } },
        { name: 'GET /subjects (public)', method: 'get', path: '/subjects', expect: { STUDENT: 200, TEACHER: 200, ADMIN_ONLY: 200, TEACHER_ADMIN: 200 } },
        { name: 'GET /subjects/categories (public)', method: 'get', path: '/subjects/categories', expect: { STUDENT: 200, TEACHER: 200, ADMIN_ONLY: 200, TEACHER_ADMIN: 200 } },
        { name: 'GET /subjects/slug/:slug (public)', method: 'get', path: '/subjects/slug/math', expect: { STUDENT: 200, TEACHER: 200, ADMIN_ONLY: 200, TEACHER_ADMIN: 200 } },
        { name: 'GET /subjects/:id (public)', method: 'get', path: '/subjects/s1', expect: { STUDENT: 200, TEACHER: 200, ADMIN_ONLY: 200, TEACHER_ADMIN: 200 } },
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
            name: 'POST /admin/users/:id/ban',
            method: 'post',
            path: '/admin/users/u1/ban',
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: '2xx',
                TEACHER_ADMIN: '2xx',
            },
        },
        {
            name: 'POST /admin/users/:id/unban',
            method: 'post',
            path: '/admin/users/u1/unban',
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: '2xx',
                TEACHER_ADMIN: '2xx',
            },
        },
        {
            name: 'GET /admin/roles (matrix)',
            method: 'get',
            path: '/admin/roles',
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: 200,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'GET /admin/roles/users',
            method: 'get',
            path: '/admin/roles/users',
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: 200,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'GET /admin/roles/changes',
            method: 'get',
            path: '/admin/roles/changes',
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: 200,
                TEACHER_ADMIN: 200,
            },
        },
        {
            name: 'PUT /admin/roles/users/:id/role',
            method: 'put',
            path: '/admin/roles/users/u1/role',
            body: { role: 'TEACHER' },
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: 'gate',
                TEACHER_ADMIN: 'gate',
            },
        },
        {
            name: 'PUT /admin/roles/users/:id/system-admin',
            method: 'put',
            path: '/admin/roles/users/u1/system-admin',
            body: { isSystemAdmin: true },
            expect: {
                STUDENT: 403,
                TEACHER: 403,
                ADMIN_ONLY: 'gate',
                TEACHER_ADMIN: 'gate',
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
