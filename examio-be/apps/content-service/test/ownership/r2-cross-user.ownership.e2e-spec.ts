import {
    bootContentApp,
    rid,
    type ContentTestApp,
    type TestUser,
} from './support/content-test-app';
import * as request from 'supertest';
import { call } from './support/http';

const BASE = 'https://cdn.examio.test';

/**
 * Cross-user R2 deletion holes (real Postgres, real guards): a user can neither
 * point their rows at another user's R2 object nor get it queued for deletion.
 * (The upload routes and their key checks moved to document-service with UserStorage.)
 */
describe('R2 cross-user deletion holes (e2e)', () => {
    let t: ContentTestApp;
    let attacker: TestUser;
    let victim: TestUser;
    let tokAttacker: string;
    const savedBase = process.env.R2_PUBLIC_URL;

    beforeAll(async () => {
        process.env.R2_PUBLIC_URL = BASE;
        t = await bootContentApp();
        attacker = await t.createUser(['TEACHER']);
        victim = await t.createUser(['TEACHER']);
        tokAttacker = await t.tokenFor(attacker);
    });
    afterAll(async () => {
        if (savedBase === undefined) delete process.env.R2_PUBLIC_URL;
        else process.env.R2_PUBLIC_URL = savedBase;
        await t.close();
    });

    const tasksFor = (key: string) =>
        t.prisma.r2DeleteTask.count({ where: { key } });

    async function seedSet(model: 'flashCardSet' | 'quizSet', thumbnail: string) {
        const id = `s_${rid()}`;
        await (t.prisma[model] as any).create({
            data: { id, title: `set ${id}`, userId: attacker.id, thumbnail },
        });
        return id;
    }

    it.each([
        ['flashCardSet', 'flashcardsets', 'flashcardset-thumbnails'],
        ['quizSet', 'quizsets', 'quizset-thumbnails'],
    ] as const)(
        'H2 %s: foreign thumbnail is rejected on create/update; deleting a row never queues a foreign or legacy key; own key is queued',
        async (model, route, area) => {
            const victimUrl = `${BASE}/${area}/${victim.id}/v-${rid()}.png`;
            // create + update reject another owner's R2 URL
            const created = await call(t.server, 'post', `/${route}`, tokAttacker, {
                title: 'x',
                thumbnail: victimUrl,
            });
            expect(created.status).toBe(400);
            const ownId = await seedSet(model, `${BASE}/${area}/${attacker.id}/ok.png`);
            const upd = await call(t.server, 'put', `/${route}/${ownId}`, tokAttacker, {
                thumbnail: victimUrl,
            });
            expect(upd.status).toBe(400);

            // a planted foreign / legacy thumbnail is never queued on delete
            const foreignKey = `${area}/${victim.id}/p-${rid()}.png`;
            const legacyKey = `${area}/legacy-${rid()}.png`;
            for (const key of [foreignKey, legacyKey]) {
                const id = await seedSet(model, `${BASE}/${key}`);
                expect((await call(t.server, 'delete', `/${route}/${id}`, tokAttacker)).status).toBeLessThan(300);
                expect(await tasksFor(key)).toBe(0);
            }

            // own key is queued once, unless another row of the owner still uses it
            const ownKey = `${area}/${attacker.id}/o-${rid()}.png`;
            const a = await seedSet(model, `${BASE}/${ownKey}`);
            const b = await seedSet(model, `${BASE}/${ownKey}`);
            await call(t.server, 'delete', `/${route}/${a}`, tokAttacker);
            expect(await tasksFor(ownKey)).toBe(0);
            await call(t.server, 'delete', `/${route}/${b}`, tokAttacker);
            expect(await tasksFor(ownKey)).toBe(1);
        }
    );

    // F11: `%2e%2e` (any case) passes a literal `..` check, then resolves to another
    // owner's object once a browser or fetcher normalises it. Only canonical keys may pass.
    const TRAVERSALS = ['%2e%2e', '%2E%2E'] as const;

    it.each(TRAVERSALS)(
        'F11 flashcard create with a thumbnail traversing %s into another owner prefix is 400 (JSON and multipart); no row',
        async (enc) => {
            const bad = `${BASE}/flashcardset-thumbnails/${attacker.id}/${enc}/${victim.id}/v-${rid()}.png`;
            // control: the same route accepts the caller's own canonical key
            const own = `${BASE}/flashcardset-thumbnails/${attacker.id}/ok-${rid()}.png`;
            const okTitle = `trav-ok-${rid()}`;
            expect((await call(t.server, 'post', '/flashcardsets', tokAttacker, { title: okTitle, thumbnail: own })).status).toBeLessThan(300);

            const jsonTitle = `trav-json-${rid()}`;
            const json = await call(t.server, 'post', '/flashcardsets', tokAttacker, { title: jsonTitle, thumbnail: bad });
            expect(json.status).toBe(400);
            expect(JSON.stringify(json.body)).toContain('Thumbnail');
            expect(await t.prisma.flashCardSet.count({ where: { title: jsonTitle } })).toBe(0);

            const formTitle = `trav-form-${rid()}`;
            const form = await request(t.server)
                .post('/api/v1/flashcardsets')
                .set('Authorization', `Bearer ${tokAttacker}`)
                .field('title', formTitle)
                .field('thumbnail', bad);
            expect(form.status).toBe(400);
            expect(await t.prisma.flashCardSet.count({ where: { title: formTitle } })).toBe(0);
        }
    );

    it.each(TRAVERSALS)(
        'F11 flashcard update to a thumbnail traversing %s into another owner prefix is 400; the row keeps its thumbnail',
        async (enc) => {
            const own = `${BASE}/flashcardset-thumbnails/${attacker.id}/o-${rid()}.png`;
            const id = await seedSet('flashCardSet', own);
            const bad = `${BASE}/flashcardset-thumbnails/${attacker.id}/${enc}/${victim.id}/v-${rid()}.png`;
            const res = await call(t.server, 'put', `/flashcardsets/${id}`, tokAttacker, { thumbnail: bad });
            expect(res.status).toBe(400);
            expect(await t.prisma.flashCardSet.findUnique({ where: { id } })).toMatchObject({ thumbnail: own });
            // control: the same route accepts a canonical key under the caller's prefix
            const good = `${BASE}/flashcardset-thumbnails/${attacker.id}/g-${rid()}.png`;
            expect((await call(t.server, 'put', `/flashcardsets/${id}`, tokAttacker, { thumbnail: good })).status).toBeLessThan(300);
        }
    );

    // URL normalisation variants: WHATWG URL parsing strips tab/newline inside a segment
    // (`.\t.` becomes `..`), lower-cases scheme and host, and drops a default port. Each
    // resolves to user A's object, so each must be rejected for user B.
    it('F11 thumbnail URLs that normalise to another owner (tab/newline segments, upper-case scheme and host, explicit :443) are 400', async () => {
        const obj = `v-${rid()}.png`;
        const bad = [
            `${BASE}/flashcardset-thumbnails/${attacker.id}/.\t./${victim.id}/${obj}`,
            `${BASE}/flashcardset-thumbnails/${attacker.id}/.\n./${victim.id}/${obj}`,
            `HTTPS://CDN.EXAMIO.TEST/flashcardset-thumbnails/${victim.id}/${obj}`,
            `https://cdn.examio.test:443/flashcardset-thumbnails/${victim.id}/${obj}`,
        ];
        for (const url of bad) {
            const title = `norm-${rid()}`;
            const res = await call(t.server, 'post', '/flashcardsets', tokAttacker, { title, thumbnail: url });
            expect({ url, status: res.status }).toEqual({ url, status: 400 });
            expect(await t.prisma.flashCardSet.count({ where: { title } })).toBe(0);
        }
    });

    it('F11 thumbnail with an empty segment (`//`) under the own prefix is 400 on create and update', async () => {
        const bad = `${BASE}/flashcardset-thumbnails/${attacker.id}//${victim.id}/v-${rid()}.png`;
        const title = `empty-${rid()}`;
        const created = await call(t.server, 'post', '/flashcardsets', tokAttacker, { title, thumbnail: bad });
        expect(created.status).toBe(400);
        expect(await t.prisma.flashCardSet.count({ where: { title } })).toBe(0);

        const own = `${BASE}/flashcardset-thumbnails/${attacker.id}/o-${rid()}.png`;
        const id = await seedSet('flashCardSet', own);
        const upd = await call(t.server, 'put', `/flashcardsets/${id}`, tokAttacker, { thumbnail: bad });
        expect(upd.status).toBe(400);
        expect(await t.prisma.flashCardSet.findUnique({ where: { id } })).toMatchObject({ thumbnail: own });
    });

    it('F11 an unchanged legacy thumbnail (owner-less key, already on the row) round-trips through update with 2xx', async () => {
        const legacy = `${BASE}/flashcardset-thumbnails/legacy-${rid()}.png`;
        const id = await seedSet('flashCardSet', legacy);
        const res = await call(t.server, 'put', `/flashcardsets/${id}`, tokAttacker, {
            title: `kept-${rid()}`,
            thumbnail: legacy,
        });
        expect(res.status).toBeLessThan(300);
        expect(await t.prisma.flashCardSet.findUnique({ where: { id } })).toMatchObject({ thumbnail: legacy });
    });
});
