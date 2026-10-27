import * as request from 'supertest';
import {
    bootContentApp,
    type ContentTestApp,
    type TestUser,
} from './support/content-test-app';
import { call } from './support/http';
import { seedQuizSet } from './support/seed';

/** Real Redis: a write must be visible to the very next read (no 5 minute stale cache). */
describe('read-after-write cache coherence (e2e)', () => {
    let t: ContentTestApp;
    let teacher: TestUser;
    let tok: string;

    beforeAll(async () => {
        t = await bootContentApp();
        teacher = await t.createUser(['TEACHER']);
        tok = await t.tokenFor(teacher);
    });
    afterAll(() => t.close());

    const form = (
        method: 'put',
        path: string,
        fields: Record<string, string>
    ) => {
        let r = request(t.server)
            [method](`/api/v1${path}`)
            .set('Authorization', `Bearer ${tok}`);
        for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
        return r;
    };

    it('flashcard set: PUT title, then GET /flashcardsets/:id returns the new title at once (and the list too)', async () => {
        const created = await call(t.server, 'post', '/flashcardsets', tok, {
            title: 'before',
        });
        const id = created.body.flashcardSet?.id ?? created.body.id;
        expect(
            (await call(t.server, 'get', `/flashcardsets/${id}`, tok)).body
                .title ?? ''
        ).toBeDefined();
        const first = await call(t.server, 'get', `/flashcardsets/${id}`, tok);
        expect(first.body.title).toBe('before');
        await call(t.server, 'get', '/flashcardsets?limit=50', tok);

        expect(
            (await form('put', `/flashcardsets/${id}`, { title: 'after' }))
                .status
        ).toBe(200);
        expect(
            (await call(t.server, 'get', `/flashcardsets/${id}`, tok)).body
                .title
        ).toBe('after');
        const list = await call(
            t.server,
            'get',
            '/flashcardsets?limit=50',
            tok
        );
        expect(JSON.stringify(list.body)).toContain('after');

        // sharing writes are visible to the next study read too
        await call(t.server, 'put', `/flashcardsets/${id}/sharing`, tok, {
            isPublic: true,
        });
        expect(
            (await call(t.server, 'get', `/flashcardsets/${id}`, tok)).body
                .isPublic
        ).toBe(true);
    });

    it('quiz set: PUT title, add question, delete question, label write: each visible to the next GET', async () => {
        const created = await call(t.server, 'post', '/quizsets', tok, {
            title: 'qbefore',
        });
        const id = created.body.quizSet?.id ?? created.body.id;
        expect(
            (await call(t.server, 'get', `/quizsets/${id}`, tok)).body.title
        ).toBe('qbefore');

        expect(
            (await form('put', `/quizsets/${id}`, { title: 'qafter' })).status
        ).toBe(200);
        expect(
            (await call(t.server, 'get', `/quizsets/${id}`, tok)).body.title
        ).toBe('qafter');

        const q = await call(
            t.server,
            'post',
            `/quizsets/${id}/questions`,
            tok,
            { question: 'Q?', options: ['a', 'b'], answer: 'a' }
        );
        expect(q.status).toBe(201);
        const afterAdd = await call(t.server, 'get', `/quizsets/${id}`, tok);
        expect(JSON.stringify(afterAdd.body)).toContain('Q?');

        const label = await call(
            t.server,
            'post',
            `/quizsets/${id}/labels`,
            tok,
            { name: 'L' }
        );
        expect(label.status).toBe(201);
        expect(
            JSON.stringify(
                (await call(t.server, 'get', `/quizsets/${id}`, tok)).body
            )
        ).toContain('"L"');

        const qid = q.body.question?.id ?? q.body.id;
        expect(
            (
                await call(
                    t.server,
                    'delete',
                    `/quizsets/${id}/questions/${qid}`,
                    tok
                )
            ).status
        ).toBe(200);
        expect(
            JSON.stringify(
                (await call(t.server, 'get', `/quizsets/${id}`, tok)).body
            )
        ).not.toContain('Q?');

        expect(
            (await call(t.server, 'delete', `/quizsets/${id}`, tok)).status
        ).toBe(200);
        expect(
            (await call(t.server, 'get', `/quizsets/${id}`, tok)).status
        ).toBe(404);
    });

});
