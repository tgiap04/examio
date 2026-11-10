import { FinanceClient } from '@examio/grpc';
import {
    bootVocabularyApp,
    rid,
    type VocabularyTestApp,
} from './support/vocabulary-test-app';
import { call } from './support/http';

/**
 * HTTP authorization of the word-family routes with the real guards (RBAC
 * catalog), real Postgres and Redis. Generation is free for TEACHERs: no wallet
 * is touched, the per-user daily cap (20) and the permission are the only brakes.
 */
describe('vocabulary permissions (e2e)', () => {
    let t: VocabularyTestApp;
    const slug = `cat-${rid()}`;
    let familyId: string;
    const tok = {} as Record<'student' | 'teacher' | 'admin', string>;

    beforeAll(async () => {
        t = await bootVocabularyApp();
        tok.student = await t.tokenFor(t.createUser(['STUDENT']));
        tok.teacher = await t.tokenFor(t.createUser(['TEACHER']));
        tok.admin = await t.tokenFor(t.createUser(['SYSTEM_ADMIN']));
        const category = await t.prisma.wordFamilyCategory.create({
            data: { name: `Category ${slug}`, slug },
        });
        const family = await t.prisma.wordFamily.create({
            data: {
                rootWord: `root-${rid()}`,
                categoryId: category.id,
                categorySlug: slug,
                data: { rootWord: 'root', categorySlug: slug, words: [] },
            },
        });
        familyId = family.id;
    });

    afterAll(async () => {
        await t.close();
    });

    it('POST /word-family/generate: STUDENT 403, anonymous 401, SYSTEM_ADMIN-only 403', async () => {
        const body = { categorySlug: slug, numRootWords: 1 };
        expect((await call(t.server, 'post', '/word-family/generate', tok.student, body)).status).toBe(403);
        expect((await call(t.server, 'post', '/word-family/generate', undefined, body)).status).toBe(401);
        expect((await call(t.server, 'post', '/word-family/generate', tok.admin, body)).status).toBe(403);
        expect(t.ai.requests).toHaveLength(0);
    });

    it('POST /word-family/save: STUDENT 201 (own collection)', async () => {
        const res = await call(t.server, 'post', '/word-family/save', tok.student, { wordFamilyId: familyId });
        expect(res.status).toBe(201);
        const saved = await call(t.server, 'get', '/word-family/saved', tok.student);
        expect(saved.status).toBe(200);
        expect(saved.body.map((s: { wordFamilyId: string }) => s.wordFamilyId)).toContain(familyId);
    });

    it('TEACHER: save 201 then GET saved 200; collections are per user', async () => {
        const save = await call(t.server, 'post', '/word-family/save', tok.teacher, { wordFamilyId: familyId });
        expect(save.status).toBe(201);
        const saved = await call(t.server, 'get', '/word-family/saved', tok.teacher);
        expect(saved.status).toBe(200);
        expect(saved.body).toHaveLength(1);
        // the student's row is not in the teacher's list and vice versa
        const studentList = await call(t.server, 'get', '/word-family/saved', tok.student);
        expect(studentList.body).toHaveLength(1);
        expect(studentList.body[0].userId).not.toBe(saved.body[0].userId);
    });

    it('read routes accept STUDENT and TEACHER, refuse a SYSTEM_ADMIN-only token', async () => {
        expect((await call(t.server, 'get', '/word-family/categories', tok.student)).status).toBe(200);
        expect((await call(t.server, 'get', '/word-family/categories', tok.teacher)).status).toBe(200);
        expect((await call(t.server, 'get', '/word-family/categories', tok.admin)).status).toBe(403);
        expect((await call(t.server, 'get', '/word-family/categories')).status).toBe(401);
    });

    it('TEACHER generate is 2xx, calls ai-service over gRPC with a service token, and touches no wallet', async () => {
        const res = await call(t.server, 'post', '/word-family/generate', tok.teacher, {
            categorySlug: slug,
            numRootWords: 1,
        });
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
        expect(res.body.rootWord).toBe('order');
        expect(t.ai.requests).toHaveLength(1);
        expect(t.ai.requests[0]).toMatchObject({
            authorization: 'Bearer e2e-service-token',
            body: { categorySlug: slug, numRootWords: 1 },
        });
        // vocabulary has no finance client at all: there is nothing that could debit a wallet
        expect(() => t.app.get(FinanceClient, { strict: false })).toThrow();
    });

    it('the 21st generation of a user in one day is 429 and never reaches ai-service', async () => {
        const heavy = await t.tokenFor(t.createUser(['TEACHER']));
        const body = { categorySlug: slug, numRootWords: 1 };
        const before = t.ai.requests.length;
        for (let i = 0; i < 20; i++) {
            const ok = await call(t.server, 'post', '/word-family/generate', heavy, body);
            expect([i, ok.status]).toEqual([i, 201]);
        }
        const over = await call(t.server, 'post', '/word-family/generate', heavy, body);
        expect(over.status).toBe(429);
        expect(over.body.code).toBe('WORD_FAMILY_DAILY_LIMIT');
        expect(t.ai.requests.length - before).toBe(20);
    });

    it('generation counters live under the vocab: Redis prefix', async () => {
        const client = (await import('@examio/redis')).RedisService;
        const redis = t.app.get(client).getClient();
        const keys = await redis.keys('vocab:gen:daily:*');
        expect(keys.length).toBeGreaterThan(0);
        expect(await redis.keys('wf:*')).toEqual([]);
    });
});
