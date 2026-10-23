import { Metadata } from '@grpc/grpc-js';
import { lastValueFrom, type Observable } from 'rxjs';
import {
    bootVocabularyApp,
    rid,
    type TestRole,
    type VocabularyTestApp,
} from './support/vocabulary-test-app';
import { call } from './support/http';

/**
 * The real VocabularyServiceModule behind its real gRPC server (generated
 * contract types), real Postgres: admin writes through the forwarded admin token
 * are visible to the HTTP reads, and word_family:admin is required.
 */
describe('vocabulary gRPC contract (e2e)', () => {
    let t: VocabularyTestApp;
    const adminId = `adm_${rid()}`;

    const md = async (roles: TestRole[], sub = adminId, audience?: string) => {
        const m = new Metadata();
        const token = await t.tokenFor({ id: sub, roles, av: 0 }, { audience });
        m.set('authorization', `Bearer ${token}`);
        return m;
    };

    beforeAll(async () => {
        t = await bootVocabularyApp();
    });
    afterAll(async () => {
        await t.close();
    });

    it('admin UpsertCategory is visible through GET /word-family/categories', async () => {
        const slug = `grpc-${rid()}`;
        const res = await lastValueFrom(
            t.grpc.admin.upsertCategory(
                { id: '', name: `Name ${slug}`, slug, description: 'd', order: 3 },
                await md(['SYSTEM_ADMIN'])
            )
        );
        expect(res.category).toMatchObject({ slug, isActive: true, order: 3 });

        const student = await t.tokenFor(t.createUser(['STUDENT']));
        const http = await call(t.server, 'get', '/word-family/categories', student);
        expect(http.status).toBe(200);
        expect(http.body.map((c: { slug: string }) => c.slug)).toContain(slug);

        const listed = await lastValueFrom(
            t.grpc.admin.listCategories({ includeInactive: true }, await md(['SYSTEM_ADMIN']))
        );
        expect(listed.categories.map((c) => c.slug)).toContain(slug);
    });

    it.each(['STUDENT', 'TEACHER'] as const)(
        'a %s token (no word_family:admin) is PERMISSION_DENIED on every admin RPC',
        async (role) => {
            const m = await md([role]);
            const attempts: Observable<unknown>[] = [
                t.grpc.admin.listCategories({ includeInactive: false }, m),
                t.grpc.admin.upsertCategory({ id: '', name: 'x', slug: `deny-${rid()}` }, m),
                t.grpc.admin.deleteCategory({ id: 'whatever' }, m),
            ];
            for (const attempt of attempts) {
                await expect(lastValueFrom(attempt)).rejects.toMatchObject({ code: 7 });
            }
        }
    );

    it('no metadata is UNAUTHENTICATED', async () => {
        await expect(
            lastValueFrom(t.grpc.admin.listCategories({ includeInactive: false }, new Metadata()))
        ).rejects.toMatchObject({ code: 16 });
    });

    it('GetWordFamily: a user token reads a catalog row; unknown id is NOT_FOUND; bad payload FAILED_PRECONDITION', async () => {
        const slug = `wf-${rid()}`;
        const category = await t.prisma.wordFamilyCategory.create({
            data: { name: `Cat ${slug}`, slug },
        });
        const ok = await t.prisma.wordFamily.create({
            data: {
                rootWord: 'order',
                categoryId: category.id,
                categorySlug: slug,
                data: {
                    rootWord: 'order',
                    categorySlug: slug,
                    words: [{ word: 'order', pos: 'v', meaningEn: 'e', meaningVi: 'v', example: 'x' }],
                },
            },
        });
        const bad = await t.prisma.wordFamily.create({
            data: { rootWord: 'broken', categoryId: category.id, categorySlug: slug, data: { nope: true } },
        });
        const m = await md(['STUDENT'], 'someone');

        const res = await lastValueFrom(t.grpc.lookup.getWordFamily({ id: ok.id }, m));
        expect(res.wordFamily).toMatchObject({
            id: ok.id,
            rootWord: 'order',
            categorySlug: slug,
            categoryName: `Cat ${slug}`,
        });
        expect(res.wordFamily?.words).toEqual([
            { word: 'order', pos: 'v', meaningEn: 'e', meaningVi: 'v', example: 'x' },
        ]);
        await expect(lastValueFrom(t.grpc.lookup.getWordFamily({ id: 'nope' }, m))).rejects.toMatchObject({ code: 5 });
        await expect(lastValueFrom(t.grpc.lookup.getWordFamily({ id: bad.id }, m))).rejects.toMatchObject({ code: 9 });
        await expect(
            lastValueFrom(t.grpc.lookup.getWordFamily({ id: ok.id }, new Metadata()))
        ).rejects.toMatchObject({ code: 16 });
    });
});
