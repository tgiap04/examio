/**
 * Cutover smoke: drives the real stack through the public entry (nginx or the
 * gateway) with real accounts. Every check prints PASS or FAIL; exit 1 on any FAIL.
 *
 *   BASE_URL=https://examio.example TEACHER_EMAIL=... TEACHER_PASSWORD=... \
 *   STUDENT_EMAIL=... STUDENT_PASSWORD=... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *   TARGET_EMAIL=... TARGET_PASSWORD=... yarn smoke:cutover
 *
 * BASE_URL is the origin that serves `/api/v1` and `/ws/study` (no path).
 * Accounts: a TEACHER, a STUDENT, a SYSTEM_ADMIN, and a TARGET account (a second
 * STUDENT or TEACHER that the admin flips and flips back). Optional:
 *   TURNSTILE_TOKEN  sent on every login (production enforces the captcha; a Cloudflare
 *                    test secret accepts `XXXX.DUMMY.TOKEN.XXXX`, see cutover-runbook.md)
 *   STALE_WAIT_MS    how long a role change may take to reach the gateway (default 15000)
 *
 * Four logins per run: the gateway allows 5 per minute per client IP, so wait a minute
 * before a re-run. Everything it creates is deleted at the end (also after a failure).
 */
import axios, { type AxiosResponse } from 'axios';
import { io, type Socket } from 'socket.io-client';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- response bodies are probed, not typed

interface Account {
    label: string;
    credential: string;
    password: string;
    cookies: Map<string, string>;
    userId?: string;
}

const REQUIRED = [
    'BASE_URL',
    'TEACHER_EMAIL',
    'TEACHER_PASSWORD',
    'STUDENT_EMAIL',
    'STUDENT_PASSWORD',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'TARGET_EMAIL',
    'TARGET_PASSWORD',
] as const;

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(', ')}`);
    process.exit(2);
}

const env = (name: (typeof REQUIRED)[number]): string => process.env[name] as string;
const BASE_URL = env('BASE_URL').replace(/\/+$/, '');
const API = `${BASE_URL}/api/v1`;
const TURNSTILE_TOKEN = process.env.TURNSTILE_TOKEN;
const STALE_WAIT_MS = Number(process.env.STALE_WAIT_MS) || 15_000;
const SESSION_COOKIES = ['accessToken', 'refreshToken'];
/** Sent on every request, as the TLS-terminating proxy in front of the stack would. */
const FORWARDED_HTTPS = { 'X-Forwarded-Proto': 'https' };

const account = (label: string, email: string, password: string): Account => ({
    label,
    credential: email,
    password,
    cookies: new Map(),
});
const teacher = account('teacher', env('TEACHER_EMAIL'), env('TEACHER_PASSWORD'));
const student = account('student', env('STUDENT_EMAIL'), env('STUDENT_PASSWORD'));
const admin = account('admin', env('ADMIN_EMAIL'), env('ADMIN_PASSWORD'));
const target = account('target', env('TARGET_EMAIL'), env('TARGET_PASSWORD'));

const http = axios.create({ validateStatus: () => true, maxRedirects: 0, timeout: 30_000 });

let failures = 0;
async function check(name: string, run: () => Promise<string | void>): Promise<boolean> {
    try {
        const detail = await run();
        console.log(`PASS ${name}${detail ? ` (${detail})` : ''}`);
        return true;
    } catch (err) {
        failures += 1;
        console.log(`FAIL ${name}: ${err instanceof Error ? err.message : String(err)}`);
        return false;
    }
}

function ensure(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function cookieHeader(who: Account): string {
    return [...who.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
}

/** Keeps the cookie jar in step with `Set-Cookie`; returns the raw header lines. */
function absorbCookies(who: Account, res: AxiosResponse): string[] {
    const lines = (res.headers['set-cookie'] as string[] | undefined) ?? [];
    for (const line of lines) {
        const [pair] = line.split(';');
        const at = pair.indexOf('=');
        const name = pair.slice(0, at).trim();
        const value = pair.slice(at + 1).trim();
        if (value === '' || /;\s*expires=Thu, 01 Jan 1970/i.test(line)) who.cookies.delete(name);
        else who.cookies.set(name, value);
    }
    return lines;
}

async function call(
    who: Account,
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    data?: unknown
): Promise<AxiosResponse<Json>> {
    const res = await http.request<Json>({
        method,
        url: `${API}${path}`,
        data,
        headers: { Cookie: cookieHeader(who), ...FORWARDED_HTTPS },
    });
    absorbCookies(who, res);
    return res;
}

const expectStatus = (res: AxiosResponse, wanted: number | number[], what: string): void => {
    const list = Array.isArray(wanted) ? wanted : [wanted];
    ensure(list.includes(res.status), `${what}: HTTP ${res.status} ${JSON.stringify(res.data)?.slice(0, 200)}`);
};

async function login(who: Account): Promise<void> {
    const res = await http.post<Json>(
        `${API}/auth/login`,
        { credential: who.credential, password: who.password, ...(TURNSTILE_TOKEN ? { turnstileToken: TURNSTILE_TOKEN } : {}) },
        { headers: FORWARDED_HTTPS }
    );
    expectStatus(res, [200, 201], `login ${who.label}`);
    const lines = absorbCookies(who, res);
    const names = lines.map((l) => l.split('=')[0].trim()).sort();
    ensure(
        JSON.stringify(names) === JSON.stringify([...SESSION_COOKIES].sort()),
        `login ${who.label} must set exactly ${SESSION_COOKIES.join(' + ')}, got [${names.join(', ')}]`
    );
    for (const line of lines) {
        const name = line.split('=')[0];
        ensure(/;\s*SameSite=Lax/i.test(line), `${name} cookie is not SameSite=Lax`);
        ensure(/;\s*HttpOnly/i.test(line), `${name} cookie is not HttpOnly`);
    }
}

async function me(who: Account): Promise<{ id: string; roles: string[] }> {
    const res = await call(who, 'get', '/auth/me');
    expectStatus(res, 200, `/auth/me ${who.label}`);
    const id = res.data?.user?.id;
    ensure(typeof id === 'string' && id.length > 0, `/auth/me ${who.label} returned no user.id`);
    ensure(Array.isArray(res.data?.roles), `/auth/me ${who.label} returned no roles`);
    who.userId = id;
    return { id, roles: res.data.roles as string[] };
}

function studyRoomSocket(who: Account, roomId: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket: Socket = io(BASE_URL, {
            path: '/ws/study',
            transports: ['websocket'],
            extraHeaders: { Cookie: cookieHeader(who), ...FORWARDED_HTTPS },
            reconnection: false,
            timeout: 15_000,
        });
        const done = (fn: () => void) => {
            clearTimeout(timer);
            socket.close();
            fn();
        };
        const timer = setTimeout(() => done(() => reject(new Error('no room:snapshot within 15 s'))), 15_000);
        socket.on('connect_error', (err) => done(() => reject(new Error(`socket connect_error: ${err.message}`))));
        socket.on('error', (err: unknown) => done(() => reject(new Error(`room error: ${JSON.stringify(err)}`))));
        socket.on('connect', () => socket.emit('room:join', { roomId }));
        socket.on('room:snapshot', () => done(() => resolve(`transport ${socket.io.engine.transport.name}`)));
    });
}

async function main(): Promise<void> {
    const created = { quizSetId: '', flashcardSetId: '', roomId: '' };
    let targetBaseRole: string | undefined;
    let targetFlipped = false;

    try {
        for (const who of [teacher, student, admin, target]) {
            await check(`login ${who.label}: only accessToken + refreshToken, HttpOnly, SameSite=Lax`, () => login(who));
        }
        if (failures > 0) return; // nothing below works without sessions

        await check('/auth/me roles: teacher=TEACHER, student=STUDENT, admin=SYSTEM_ADMIN', async () => {
            const [t, s, a] = [await me(teacher), await me(student), await me(admin)];
            ensure(t.roles.includes('TEACHER'), `teacher roles ${t.roles}`);
            ensure(s.roles.includes('STUDENT') && !s.roles.includes('TEACHER'), `student roles ${s.roles}`);
            ensure(a.roles.includes('SYSTEM_ADMIN'), `admin roles ${a.roles}`);
            const tg = await me(target);
            targetBaseRole = tg.roles.find((r) => r === 'STUDENT' || r === 'TEACHER');
            ensure(targetBaseRole, `target has no base role: ${tg.roles}`);
        });

        const stamp = `smoke-${Date.now()}`;
        await check('teacher creates a quiz set', async () => {
            const res = await call(teacher, 'post', '/quizsets', { title: `${stamp} quiz`, isPublic: false });
            expectStatus(res, [200, 201], 'create quiz set');
            created.quizSetId = res.data?.quizSet?.id;
            ensure(created.quizSetId, 'no quizSet.id in the response');
            return created.quizSetId;
        });
        await check('teacher creates a flashcard set', async () => {
            const res = await call(teacher, 'post', '/flashcardsets', { title: `${stamp} cards`, isPublic: false });
            expectStatus(res, [200, 201], 'create flashcard set');
            created.flashcardSetId = res.data?.flashcardSet?.id;
            ensure(created.flashcardSetId, 'no flashcardSet.id in the response');
            return created.flashcardSetId;
        });

        const studentId = student.userId as string;
        await check('student cannot read the private sets before the grant', async () => {
            const res = await call(student, 'get', `/flashcardsets/study/${created.flashcardSetId}`);
            ensure([403, 404].includes(res.status), `expected 403/404, got ${res.status}`);
        });
        await check('teacher whitelists the student on both sets', async () => {
            const quiz = await call(teacher, 'put', `/quizsets/${created.quizSetId}/sharing`, { addUserIds: [studentId] });
            expectStatus(quiz, [200, 201], 'share quiz set');
            const cards = await call(teacher, 'put', `/flashcardsets/${created.flashcardSetId}/sharing`, { addUserIds: [studentId] });
            expectStatus(cards, [200, 201], 'share flashcard set');
        });
        await check('student reads the whitelisted flashcard set and can practise the quiz set', async () => {
            const cards = await call(student, 'get', `/flashcardsets/study/${created.flashcardSetId}`);
            expectStatus(cards, 200, 'study flashcard set');
            const quiz = await call(student, 'get', `/quiz-practice/sets/${created.quizSetId}/access`);
            expectStatus(quiz, 200, 'quiz access');
            ensure(quiz.data?.canAccess === true, `quiz access answer: ${JSON.stringify(quiz.data)}`);
        });
        await check('student gets 403 on a teacher-only route', async () => {
            const res = await call(student, 'get', '/quizsets');
            ensure(res.status === 403, `expected 403, got ${res.status}`);
        });

        await check('page flags and config endpoint are reachable', async () => {
            const res = await call(student, 'get', '/config/pages');
            expectStatus(res, 200, '/config/pages');
            ensure(Array.isArray(res.data?.pages), 'no pages array');
            return `${res.data.pages.length} flags`;
        });

        await check('teacher creates a study room; student joins it over socket.io at /ws/study', async () => {
            const room = await call(teacher, 'post', '/studyrooms', { name: `${stamp} room`, accessType: 2, whitelist: [studentId] });
            expectStatus(room, [200, 201], 'create study room');
            created.roomId = room.data?.id;
            ensure(created.roomId, 'no room id in the response');
            const joined = await call(student, 'post', `/studyrooms/${created.roomId}/join`, {});
            expectStatus(joined, [200, 201], 'join study room over HTTP');
            return await studyRoomSocket(student, created.roomId);
        });

        await check('admin flips TARGET role; the next call gets 401 TOKEN_STALE, then refresh succeeds', async () => {
            const found = await call(admin, 'get', `/admin/roles/users?q=${encodeURIComponent(target.credential)}`);
            expectStatus(found, 200, 'admin roles users');
            const row = (found.data?.data as Json[] | undefined)?.find((u) => u.email?.toLowerCase() === target.credential.toLowerCase());
            ensure(row?.id, 'target not found in /admin/roles/users');
            const next = targetBaseRole === 'TEACHER' ? 'STUDENT' : 'TEACHER';
            const flip = await call(admin, 'put', `/admin/roles/users/${row.id}/role`, { role: next, reason: 'cutover smoke' });
            expectStatus(flip, 200, 'set role');
            targetFlipped = true;

            // The fast gRPC path and the durable event both write the same Redis key: allow seconds, not minutes.
            const deadline = Date.now() + STALE_WAIT_MS;
            let last: AxiosResponse<Json> | undefined;
            while (Date.now() < deadline) {
                last = await call(target, 'get', '/auth/me');
                if (last.status === 401) break;
                await new Promise((r) => setTimeout(r, 500));
            }
            ensure(last?.status === 401 && last.data?.code === 'TOKEN_STALE', `expected 401 TOKEN_STALE, got ${last?.status} ${JSON.stringify(last?.data)}`);

            const refreshed = await call(target, 'post', '/auth/refresh', {});
            expectStatus(refreshed, [200, 201], 'refresh');
            const after = await me(target);
            ensure(after.roles.includes(next), `after refresh the roles are ${after.roles}, wanted ${next}`);
        });
    } finally {
        await cleanup(created, targetFlipped ? targetBaseRole : undefined);
    }
}

async function cleanup(created: { quizSetId: string; flashcardSetId: string; roomId: string }, restoreRole?: string): Promise<void> {
    const attempts: Array<[string, () => Promise<AxiosResponse<Json>>]> = [];
    if (created.roomId) attempts.push(['delete study room', () => call(teacher, 'delete', `/studyrooms/${created.roomId}`)]);
    if (created.flashcardSetId) attempts.push(['delete flashcard set', () => call(teacher, 'delete', `/flashcardsets/${created.flashcardSetId}`)]);
    if (created.quizSetId) attempts.push(['delete quiz set', () => call(teacher, 'delete', `/quizsets/${created.quizSetId}`)]);
    if (restoreRole && target.userId) {
        attempts.push(['restore TARGET role', () => call(admin, 'put', `/admin/roles/users/${target.userId}/role`, { role: restoreRole, reason: 'cutover smoke cleanup' })]);
    }
    for (const [name, run] of attempts) {
        await check(`cleanup: ${name}`, async () => {
            const res = await run();
            expectStatus(res, [200, 204, 404], name);
        });
    }
}

main()
    .catch((err) => {
        failures += 1;
        console.log(`FAIL unexpected error: ${err instanceof Error ? err.stack : String(err)}`);
    })
    .finally(() => {
        console.log(failures === 0 ? '\nSMOKE OK' : `\nSMOKE FAILED (${failures} failing check${failures === 1 ? '' : 's'})`);
        process.exit(failures === 0 ? 0 : 1);
    });
