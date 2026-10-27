import { Pool } from 'pg';
import { PrismaClient } from '../../apps/content-service/src/generated/prisma/client';
import { createPrismaAdapter } from '../../apps/content-service/src/prisma/create-prisma-adapter';
import { FlashcardsetService } from '../../apps/content-service/src/modules/flashcardset/flashcardset.service';
import { FlashCardSetRepository } from '../../apps/content-service/src/modules/flashcardset/flashcardset.repository';
import { R2DeleteTaskWriter } from '../../libs/messaging/src/r2-delete/r2-delete-task.writer';
import { toPgConnectionString } from '../../libs/messaging/src/relay-pool';
import { assertLocal, describeWhenEnabled, urlOf } from './db-env';

/** Deleting a flashcard set with a thumbnail writes the r2_delete_tasks row in the same tx (real Postgres). */
const url = urlOf('content');
const describeDb = describeWhenEnabled(Boolean(url), 'CONTENT_DATABASE_URL');
const BASE = 'https://cdn.examio.test';

describeDb('FlashcardsetService.deleteFlashcardSet -> r2_delete_tasks (content schema, real Postgres)', () => {
    const tag = `t${Date.now().toString(36)}`;
    // Owner-scoped key space of the user deleting: flashcardset-thumbnails/<userId>/<random>-<name>.
    const own = `flashcardset-thumbnails/u-e2e/${tag}`;
    let prisma: PrismaClient;
    let pool: Pool;
    let service: FlashcardsetService;

    // Redis is not under test: every cache call is a no-op.
    const redis = new Proxy({}, { get: () => async () => null }) as never;

    beforeAll(() => {
        assertLocal(url as string);
        process.env.R2_PUBLIC_URL = BASE;
        prisma = new PrismaClient({ adapter: createPrismaAdapter(url) });
        pool = new Pool({ connectionString: toPgConnectionString(url as string), max: 2 });
        const repo = new FlashCardSetRepository(prisma as never, redis);
        service = new FlashcardsetService(
            prisma as never,
            repo,
            { generateId: () => 'id' } as never,
            { deleteFile: jest.fn() } as never,
            redis,
            {} as never,
            new R2DeleteTaskWriter()
        );
    });
    afterEach(async () => {
        await pool.query('DELETE FROM r2_delete_tasks WHERE key LIKE $1', [`%${tag}%`]);
    });
    afterAll(async () => {
        await prisma.$disconnect();
        await pool.end();
    });

    const tasks = async () =>
        (await pool.query('SELECT key FROM r2_delete_tasks WHERE key LIKE $1', [`%${tag}%`])).rows.map((r) => r.key);

    it('creates the task row together with the row delete', async () => {
        const id = `${tag}-set1`;
        await prisma.flashCardSet.create({
            data: { id, title: 't', userId: 'u-e2e', thumbnail: `${BASE}/${own}-thumb.png` },
        });
        await service.deleteFlashcardSet(id, { id: 'u-e2e' } as never);
        expect(await prisma.flashCardSet.findUnique({ where: { id } })).toBeNull();
        expect(await tasks()).toEqual([`${own}-thumb.png`]);
    });

    it('never queues a legacy owner-less or another user thumbnail', async () => {
        for (const [i, key] of [
            `flashcardset-thumbnails/${tag}-legacy.png`,
            `flashcardset-thumbnails/u-other/${tag}-foreign.png`,
        ].entries()) {
            const id = `${tag}-set-skip${i}`;
            await prisma.flashCardSet.create({
                data: { id, title: 't', userId: 'u-e2e', thumbnail: `${BASE}/${key}` },
            });
            await service.deleteFlashcardSet(id, { id: 'u-e2e' } as never);
            expect(await prisma.flashCardSet.findUnique({ where: { id } })).toBeNull();
        }
        expect(await tasks()).toEqual([]);
    });

    it('a failed row delete leaves no task row (tx rollback)', async () => {
        const id = `${tag}-set2`;
        await prisma.flashCardSet.create({
            data: { id, title: 't', userId: 'u-e2e', thumbnail: `${BASE}/${own}-thumb2.png` },
        });
        // Break the delete inside the tx: the repository delete throws after the writer would run.
        const repo = (service as unknown as { flashcardSetRepository: FlashCardSetRepository }).flashcardSetRepository;
        const original = repo.delete.bind(repo);
        repo.delete = (async (...args: Parameters<typeof original>) => {
            await original(...args);
            throw new Error('boom after delete');
        }) as typeof repo.delete;
        await expect(service.deleteFlashcardSet(id, { id: 'u-e2e' } as never)).rejects.toThrow('boom after delete');
        repo.delete = original;
        expect(await prisma.flashCardSet.findUnique({ where: { id } })).not.toBeNull();
        expect(await tasks()).toEqual([]);
        await prisma.flashCardSet.delete({ where: { id } });
    });
});
