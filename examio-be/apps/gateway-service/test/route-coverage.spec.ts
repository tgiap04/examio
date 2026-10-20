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
    return 'exam';
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
        expect(target('/api/v1/quizsets')).toBe('http://localhost:3002');
        expect(target('/api/v1/wallet/details')).toBe('http://localhost:3003');
        expect(target('/api/v1/admin/users')).toBe('http://localhost:7006');
        const custom = loadRouteTable({ env: { EXAM_SERVICE_URL: 'http://exam:3000' } });
        expect(custom.match('GET', '/api/v1/quizsets')?.target).toBe('http://exam:3000');
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
        ['GET', '/api/v1/ai/upload/u1/history', ['document:upload']],
        ['POST', '/api/v1/ai-chat/c1/message', ['ai_chat:use']],
        ['GET', '/api/v1/wallet/details', ['wallet:use']],
        ['POST', '/api/v1/payment/create', ['wallet:use']],
    ])('%s %s requires %j', (method, path, permissions) => {
        expect(route(method, path).permissions).toEqual(permissions);
    });

    it('the upload routes carry the 100mb / 120s override', () => {
        const upload = route('POST', '/api/v1/ai/quick-upload');
        expect(upload.maxBodyBytes).toBe(100 * 1024 * 1024);
        expect(upload.timeoutMs).toBe(120_000);
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
