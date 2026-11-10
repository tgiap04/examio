import { Metadata } from '@grpc/grpc-js';
import { lastValueFrom } from 'rxjs';
import {
    bootVocabularyApp,
    rid,
    type VocabularyTestApp,
} from './support/vocabulary-test-app';

/**
 * Category images live in R2: a delete or an image replace queues the old key in
 * `r2_delete_tasks` in the SAME transaction as the row change (real Postgres), and
 * nothing is queued when the row change rolls back.
 */
describe('vocabulary r2_delete_tasks (e2e)', () => {
    let t: VocabularyTestApp;
    const base = 'https://r2.test.kmaedu.local';
    let adminMd: Metadata;

    const queued = async (key: string) =>
        (await t.prisma.$queryRaw<Array<{ n: number }>>`
            SELECT count(*)::int AS n FROM r2_delete_tasks WHERE key = ${key}`)[0].n;

    beforeAll(async () => {
        process.env.R2_PUBLIC_URL = base;
        t = await bootVocabularyApp();
        adminMd = new Metadata();
        adminMd.set(
            'authorization',
            `Bearer ${await t.tokenFor({ id: `adm_${rid()}`, roles: ['SYSTEM_ADMIN'], av: 0 })}`
        );
    });
    afterAll(async () => {
        await t.close();
    });

    async function category(imageKey: string, suffix = rid()) {
        const slug = `img-${suffix}`;
        const created = await lastValueFrom(
            t.grpc.admin.upsertCategory(
                { id: '', name: `Img ${suffix}`, slug, imageUrl: `${base}/${imageKey}` },
                adminMd
            )
        );
        return created.category!;
    }

    it('DeleteCategory enqueues the image key with the row change (and deactivates the row)', async () => {
        const key = `word-family/${rid()}.png`;
        const cat = await category(key);
        expect(await queued(key)).toBe(0);

        const res = await lastValueFrom(t.grpc.admin.deleteCategory({ id: cat.id }, adminMd));
        expect(res.category).toMatchObject({ isActive: false, imageUrl: '' });
        expect(await queued(key)).toBe(1);
    });

    it('UpsertCategory that replaces the image queues the OLD key only', async () => {
        const oldKey = `word-family/${rid()}.png`;
        const newKey = `word-family/${rid()}.png`;
        const cat = await category(oldKey);
        await lastValueFrom(
            t.grpc.admin.upsertCategory({ id: cat.id, name: '', slug: '', imageUrl: `${base}/${newKey}` }, adminMd)
        );
        expect(await queued(oldKey)).toBe(1);
        expect(await queued(newKey)).toBe(0);
    });

    it('a row change that rolls back queues nothing (duplicate name aborts the whole tx)', async () => {
        const keyA = `word-family/${rid()}.png`;
        const a = await category(keyA);
        const b = await category(`word-family/${rid()}.png`);

        await expect(
            lastValueFrom(
                t.grpc.admin.upsertCategory(
                    { id: a.id, name: b.name, slug: '', imageUrl: `${base}/word-family/${rid()}.png` },
                    adminMd
                )
            )
        ).rejects.toMatchObject({ code: 6 }); // ALREADY_EXISTS
        expect(await queued(keyA)).toBe(0);
        const row = await t.prisma.wordFamilyCategory.findUniqueOrThrow({ where: { id: a.id } });
        expect(row.imageUrl).toBe(`${base}/${keyA}`);
    });

    it('an image outside word-family/ is never queued', async () => {
        const foreign = `documents/${rid()}.pdf`;
        const cat = await category(foreign);
        await lastValueFrom(t.grpc.admin.deleteCategory({ id: cat.id }, adminMd));
        expect(await queued(foreign)).toBe(0);
    });
});
