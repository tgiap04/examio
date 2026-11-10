import { readFileSync } from 'fs';
import { join } from 'path';
import { loadRouteTable } from '../src/routing/route-table';

const INVENTORY: string[] = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'route-inventory.json'), 'utf8')
);
const table = loadRouteTable({ env: {} });

const ALL_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function sample(path: string): string {
    return path.replace(/:[A-Za-z]+/g, 'sample').replace(/\*$/, 'sample');
}

/** Which service owns each public prefix (as the deleted proxy controllers forwarded them). */
function expectedUpstream(path: string): string {
    const resource = path.split('/')[3];
    if (resource === 'status' || resource === 'config') return 'self';
    if (['auth', 'profile', 'devices'].includes(resource)) return 'auth';
    if (['wallet', 'payment', 'webhook'].includes(resource)) return 'finance';
    if (resource === 'admin') return 'admin';
    if (resource === 'studyrooms') return 'studyroom';
    // AI chat and the public AI-teacher subjects live in ai-chat-service.
    if (resource === 'ai-chat' || resource === 'subjects') return 'aichat';
    // Uploads and the image endpoint live in document-service; generation and history are content.
    if (resource === 'r2') return 'document';
    if (resource === 'ai' && /^\/api\/v1\/ai\/(upload(\/:[A-Za-z]+)?|quick-upload|upload-image)$/.test(path)) {
        return 'document';
    }
    // The to-flashcard bridge writes a FlashCardSet, so content keeps that one path.
    if (resource === 'word-family') return /^\/api\/v1\/word-family\/:[A-Za-z]+\/to-flashcard$/.test(path) ? 'content' : 'vocabulary';
    // `/student/*` is split: the exam half is assessment, the flashcard half is content.
    if (resource === 'student') return /\/(recent-exams|pin-exam-room)/.test(path) ? 'assessment' : 'content';
    if (['examrooms', 'examsessions', 'examattempts', 'cheatinglogs'].includes(resource)) return 'assessment';
    return 'content';
}

describe('routes.yaml covers the phase-01 route inventory', () => {
    it.each(INVENTORY)('%s resolves to a route on the right upstream', (line) => {
        const [method, path] = line.split(' ');
        const methods = method === 'ALL' ? ALL_METHODS : [method];
        for (const m of methods) {
            const route = table.match(m, sample(path));
            expect({ line, m, upstream: route?.upstream }).toEqual({
                line,
                m,
                upstream: expectedUpstream(path),
            });
        }
    });

    it('upstream URLs come from the environment, defaulting to the dev ports', () => {
        const target = (path: string) => table.match('GET', path)?.target;
        expect(target('/api/v1/auth/me')).toBe('http://localhost:3001');
        expect(target('/api/v1/quizsets')).toBe('http://localhost:3013');
        expect(target('/api/v1/examrooms')).toBe('http://localhost:3014');
        expect(target('/api/v1/wallet/details')).toBe('http://localhost:3003');
        expect(target('/api/v1/admin/users')).toBe('http://localhost:7006');
        expect(target('/api/v1/studyrooms/mine')).toBe('http://localhost:3009');
        expect(target('/api/v1/word-family/categories')).toBe('http://localhost:3010');
        expect(target('/api/v1/ai/quick-upload')).toBe('http://localhost:3011');
        expect(target('/api/v1/ai-chat/c1/messages')).toBe('http://localhost:3012');
        expect(target('/api/v1/subjects')).toBe('http://localhost:3012');
        expect(table.match('POST', '/api/v1/r2/image')?.target).toBe('http://localhost:3011');
        expect(target('/api/v1/ai/upload/u1/history')).toBe('http://localhost:3013');
        expect(table.match('GET', '/ws/study')?.target).toBe('http://localhost:3009');
        const custom = loadRouteTable({
            env: {
                CONTENT_SERVICE_URL: 'http://content:3000',
                ASSESSMENT_SERVICE_URL: 'http://assessment:3000',
                STUDYROOM_SERVICE_URL: 'http://study-room:3000',
                VOCABULARY_SERVICE_URL: 'http://vocabulary:3000',
                DOCUMENT_SERVICE_URL: 'http://document:3000',
                AICHAT_SERVICE_URL: 'http://ai-chat:3000',
            },
        });
        expect(custom.match('GET', '/api/v1/quizsets')?.target).toBe('http://content:3000');
        expect(custom.match('GET', '/api/v1/examsessions/s1')?.target).toBe('http://assessment:3000');
        expect(custom.match('GET', '/api/v1/studyrooms/mine')?.target).toBe('http://study-room:3000');
        expect(custom.match('GET', '/api/v1/word-family/saved')?.target).toBe('http://vocabulary:3000');
        expect(custom.match('POST', '/api/v1/word-family/wf1/to-flashcard')?.target).toBe('http://content:3000');
        expect(custom.match('GET', '/ws/study')?.target).toBe('http://study-room:3000');
        expect(custom.match('POST', '/api/v1/ai/quick-upload')?.target).toBe('http://document:3000');
        expect(custom.match('GET', '/api/v1/ai/upload/u1/history')?.target).toBe('http://content:3000');
        expect(custom.match('POST', '/api/v1/ai-chat/c1/stream')?.target).toBe('http://ai-chat:3000');
        expect(custom.match('POST', '/api/v1/ai-chat/message/m1/regenerate-stream')?.target).toBe('http://ai-chat:3000');
        expect(custom.match('GET', '/api/v1/subjects/categories')?.target).toBe('http://ai-chat:3000');
    });

    it.each([
        '/.well-known/jwks.json',
        '/internal/token',
        '/api/v1/internal/token',
        '/api/v1/r2/internal/upload',
        '/api/v1/auth/../admin/users',
        '/api/v1/profile/%2e%2e/admin',
    ])('internal or unsafe path %s is not routed', (path) => {
        expect(table.match('GET', path)).toBeUndefined();
        expect(table.match('POST', path)).toBeUndefined();
    });
});

describe('word-family routing: the to-flashcard path beats the word-family prefix', () => {
    const at = (method: string, path: string) => table.match(method, path);

    it('POST /word-family/:id/to-flashcard goes to content, keeping auth and page flag', () => {
        const route = at('POST', '/api/v1/word-family/wf_123/to-flashcard');
        expect(route).toMatchObject({ id: 'wf-to-flashcard', upstream: 'content', pageFlag: 'word-family' });
    });

    it('every other word-family path goes to vocabulary', () => {
        for (const [method, path] of [
            ['GET', '/api/v1/word-family/categories'],
            ['GET', '/api/v1/word-family/saved'],
            ['POST', '/api/v1/word-family/generate'],
            ['POST', '/api/v1/word-family/save'],
            ['GET', '/api/v1/word-family/category/shopping/order'],
        ]) {
            expect(at(method, path)).toMatchObject({ id: 'word-family', upstream: 'vocabulary' });
        }
    });

    it('lookalikes of the bridge path stay on vocabulary (full match, POST only, one segment id)', () => {
        for (const [method, path] of [
            ['GET', '/api/v1/word-family/wf_1/to-flashcard'],
            ['POST', '/api/v1/word-family/a/b/to-flashcard'],
            ['POST', '/api/v1/word-family/wf_1/to-flashcard/extra'],
            ['POST', '/api/v1/word-family//to-flashcard'],
        ]) {
            expect(at(method, path)?.upstream).toBe('vocabulary');
        }
    });
});

describe('/student/* is split by path between content and assessment', () => {
    it.each([
        ['GET', '/api/v1/student/recent-flashcards', 'student-content', 'content'],
        ['POST', '/api/v1/student/pin-flashcard/f1', 'student-content', 'content'],
        ['GET', '/api/v1/student/recent-exams', 'student-exam', 'assessment'],
        ['POST', '/api/v1/student/pin-exam-room/r1', 'student-exam', 'assessment'],
    ])('%s %s -> %s', (method, path, id, upstream) => {
        expect(table.match(method, path)).toMatchObject({ id, upstream, auth: 'required' });
    });

    it('no catch-all student prefix remains and no route uses the removed exam upstream', () => {
        expect(table.match('GET', '/api/v1/student/unknown')).toBeUndefined();
        expect(table.routes.filter((r) => r.upstream === 'exam')).toEqual([]);
    });
});

describe('rate limits keep every current throttle (RT-4)', () => {
    const limit = (method: string, path: string) => {
        const l = table.rateLimitFor(method, path);
        return { id: l.id, max: l.max, windowMs: l.windowMs };
    };

    it.each([
        ['auth-register', 'POST', '/api/v1/auth/register', 5],
        ['auth-login', 'POST', '/api/v1/auth/login', 5],
        ['auth-verify-account', 'POST', '/api/v1/auth/verifyAccount', 5],
        ['auth-send-reset-code', 'POST', '/api/v1/auth/send-code-reset-password', 5],
        ['auth-reset-password', 'POST', '/api/v1/auth/reset-password', 5],
        ['auth-send-change-code', 'POST', '/api/v1/auth/send-code-change-password', 5],
        ['auth-change-password', 'POST', '/api/v1/auth/change-password', 5],
        ['auth-google-one-tap', 'POST', '/api/v1/auth/google/one-tap', 5],
        ['auth-refresh', 'POST', '/api/v1/auth/refresh', 30],
        ['studyroom-join', 'POST', '/api/v1/studyrooms/join', 5],
        ['ai-quick-upload', 'POST', '/api/v1/ai/quick-upload', 10],
        ['ai-generate-from-file', 'POST', '/api/v1/ai/generate-from-file', 5],
        ['ai-regenerate', 'POST', '/api/v1/ai/regenerate/u1', 5],
        ['ai-chat-stream', 'POST', '/api/v1/ai-chat/c1/stream', 10],
        [
            'ai-chat-regenerate-stream',
            'POST',
            '/api/v1/ai-chat/message/m1/regenerate-stream',
            10,
        ],
        ['flashcard-code', 'POST', '/api/v1/flashcardsets/study/s1/verify-code', 5],
        ['flashcard-code', 'POST', '/api/v1/flashcardsets/study/s1/with-code', 5],
        ['examsession-code', 'POST', '/api/v1/examsessions/study/s1/verify-code', 5],
        ['examsession-code', 'POST', '/api/v1/examsessions/study/s1/with-code', 5],
        ['quiz-unlock', 'POST', '/api/v1/quiz-practice/sets/q1/unlock', 5],
        ['word-family-generate', 'POST', '/api/v1/word-family/generate', 5],
        ['word-family-generate', 'POST', '/api/v1/word-family/generate-root', 5],
        ['flashcard-user-search', 'GET', '/api/v1/flashcardsets/users/search', 30],
        ['examsession-user-search', 'GET', '/api/v1/examsessions/users/search', 30],
        ['quizset-user-search', 'GET', '/api/v1/quizsets/users/search', 30],
    ])('%s: %s %s max %i / 60s', (id, method, path, max) => {
        expect(limit(method, path)).toEqual({ id, max, windowMs: 60_000 });
    });

    it.each(['/ws/study', '/ws/study/socket.io/'])('ws-upgrade (%s) is 20 per 10 s', (path) => {
        expect(limit('UPGRADE', path)).toEqual({
            id: 'ws-upgrade',
            max: 20,
            windowMs: 10_000,
        });
    });

    it('everything else falls to the default 100 / 60 s', () => {
        expect(limit('GET', '/api/v1/quizsets')).toEqual({
            id: 'default',
            max: 100,
            windowMs: 60_000,
        });
        // Today only `studyrooms/join` is throttled, not `studyrooms/:id/join`.
        expect(limit('POST', '/api/v1/studyrooms/s1/join').id).toBe('default');
        // Wrong method must not borrow a limit.
        expect(limit('GET', '/api/v1/auth/login').id).toBe('default');
    });
});

describe('coarse permission table', () => {
    const route = (method: string, path: string) => table.match(method, path)!;

    it.each([
        ['GET', '/api/v1/admin/users', ['admin:access']],
        ['GET', '/api/v1/ai/models', ['ai:generate']],
        ['POST', '/api/v1/ai/generate-from-file', ['ai:generate']],
        ['POST', '/api/v1/ai/quick-upload', ['document:upload']],
        ['GET', '/api/v1/ai/recent-uploads', ['document:upload']],
        ['POST', '/api/v1/ai/upload-image', ['document:upload']],
        ['GET', '/api/v1/ai/upload/u1/history', ['ai:generate']],
        ['GET', '/api/v1/ai/upload/u1', ['document:upload']],
        ['DELETE', '/api/v1/ai/upload/u1', ['document:upload']],
        ['POST', '/api/v1/ai/upload', ['document:upload']],
        ['POST', '/api/v1/r2/image', ['document:upload']],
        ['POST', '/api/v1/ai-chat/c1/message', ['ai_chat:use']],
        ['GET', '/api/v1/wallet/details', ['wallet:use']],
        ['POST', '/api/v1/payment/create', ['wallet:use']],
    ])('%s %s requires %j', (method, path, permissions) => {
        expect(route(method, path).permissions).toEqual(permissions);
    });

    it('the upload routes carry the 50mb / 120s override', () => {
        const upload = route('POST', '/api/v1/ai/quick-upload');
        expect(upload.maxBodyBytes).toBe(50 * 1024 * 1024);
        expect(upload.timeoutMs).toBe(120_000);
    });

    it('ai-upload-history is listed before ai-upload and the anchored pattern never captures it', () => {
        expect(route('GET', '/api/v1/ai/upload/u1/history')).toMatchObject({ id: 'ai-upload-history', upstream: 'content' });
        for (const [method, path] of [
            ['GET', '/api/v1/ai/upload/u1'],
            ['DELETE', '/api/v1/ai/upload/u1'],
            ['POST', '/api/v1/ai/upload'],
            ['POST', '/api/v1/ai/upload-image'],
        ]) {
            expect(route(method, path)).toMatchObject({ id: 'ai-upload', upstream: 'document' });
        }
        // lookalikes fall through to the content `ai` prefix (generation), never to document
        for (const path of ['/api/v1/ai/upload/u1/history/x', '/api/v1/ai/upload/a/b', '/api/v1/ai/uploads', '/api/v1/ai/generate-from-file']) {
            expect(route('GET', path).upstream).toBe('content');
        }
    });

    it('recent-uploads is served by content (documents over gRPC + generated history) and is listed before ai-upload', () => {
        expect(route('GET', '/api/v1/ai/recent-uploads')).toMatchObject({
            id: 'ai-recent-uploads',
            upstream: 'content',
            permissions: ['document:upload'],
            timeoutMs: 120_000,
        });
        expect(table.routes.findIndex((r) => r.id === 'ai-recent-uploads')).toBeLessThan(
            table.routes.findIndex((r) => r.id === 'ai-upload')
        );
    });

    it('r2-image goes to document with the 3mb cap', () => {
        expect(route('POST', '/api/v1/r2/image')).toMatchObject({ id: 'r2-image', upstream: 'document', maxBodyBytes: 3 * 1024 * 1024 });
    });

    it('subscription plans are the one public payment route', () => {
        const plans = route('GET', '/api/v1/payment/subscription/plans');
        expect(table.effectiveAuth(plans, 'GET', plans.prefix!)).toBe('required');
        expect(
            table.effectiveAuth(plans, 'GET', '/api/v1/payment/subscription/plans')
        ).toBe('optional');
        expect(
            table.effectiveAuth(plans, 'POST', '/api/v1/payment/subscription/plans')
        ).toBe('required');
    });

    it('flashcardsets/public/:id is public (auth optional) like the service @Public(), nothing else under it', () => {
        const fs = route('GET', '/api/v1/flashcardsets/public/f1');
        expect(table.effectiveAuth(fs, 'GET', '/api/v1/flashcardsets/public/f1')).toBe('optional');
        expect(table.effectiveAuth(fs, 'POST', '/api/v1/flashcardsets/public/f1')).toBe('required');
        expect(table.effectiveAuth(fs, 'GET', '/api/v1/flashcardsets/public/f1/extra')).toBe('required');
        expect(table.effectiveAuth(fs, 'GET', '/api/v1/flashcardsets/f1')).toBe('required');
    });

    it('quiz-practice: only GET sets/:id/access is auth-optional, everything else stays required', () => {
        const qp = route('GET', '/api/v1/quiz-practice/sets/q1/access');
        const eff = (m: string, p: string) => table.effectiveAuth(qp, m, p);
        expect(eff('GET', '/api/v1/quiz-practice/sets/q1/access')).toBe('optional');
        expect(eff('POST', '/api/v1/quiz-practice/sets/q1/access')).toBe('required');
        expect(eff('GET', '/api/v1/quiz-practice/sets/q1/access/x')).toBe('required');
        expect(eff('GET', '/api/v1/quiz-practice/sets')).toBe('required');
        expect(eff('POST', '/api/v1/quiz-practice/sets/q1/unlock')).toBe('required');
        expect(eff('POST', '/api/v1/quiz-practice/attempts')).toBe('required');
        expect(eff('GET', '/api/v1/quiz-practice/attempts/a1')).toBe('required');
    });

    it('ai-chat routes go to the named aichat upstream, keep ai_chat:use and the rate limits; subjects stay public', () => {
        for (const [method, path] of [
            ['POST', '/api/v1/ai-chat/c1/stream'],
            ['POST', '/api/v1/ai-chat/message/m1/regenerate-stream'],
            ['GET', '/api/v1/ai-chat/c1/messages'],
        ]) {
            expect(route(method, path)).toMatchObject({ upstream: 'aichat', permissions: ['ai_chat:use'] });
        }
        const subjects = route('GET', '/api/v1/subjects/categories');
        expect(subjects).toMatchObject({ id: 'subjects', upstream: 'aichat' });
        expect(table.effectiveAuth(subjects, 'GET', '/api/v1/subjects/categories')).toBe('optional');
        expect(table.rateLimitFor('POST', '/api/v1/ai-chat/c1/stream')).toMatchObject({ id: 'ai-chat-stream', windowMs: 60_000, max: 10 });
        expect(table.rateLimitFor('POST', '/api/v1/ai-chat/message/m1/regenerate-stream')).toMatchObject({
            id: 'ai-chat-regenerate-stream',
            windowMs: 60_000,
            max: 10,
        });
    });

    it('SSE routes disable the upstream timeout', () => {
        expect(route('POST', '/api/v1/ai-chat/c1/stream').timeoutMs).toBe(0);
        expect(
            route('POST', '/api/v1/ai-chat/message/m1/regenerate-stream').timeoutMs
        ).toBe(0);
        expect(route('GET', '/api/v1/admin/logs/stream').timeoutMs).toBe(0);
    });

    it('page flags map to the old PageEnabledGuard keys', () => {
        expect(route('GET', '/api/v1/ai/models').pageFlag).toBe('ai-tool');
        expect(route('GET', '/api/v1/quizsets').pageFlag).toBe('manage-exam');
        expect(route('GET', '/api/v1/flashcardsets').pageFlag).toBe('flash-card');
        expect(route('GET', '/api/v1/examrooms/list').pageFlag).toBe('manage-exam-room');
        expect(route('GET', '/api/v1/word-family/saved').pageFlag).toBe('word-family');
        expect(route('GET', '/api/v1/studyrooms/mine').pageFlag).toBe('study-room');
        expect(route('GET', '/ws/study').pageFlag).toBe('study-room');
        expect(route('GET', '/ws/study').websocket).toBe(true);
    });
});
