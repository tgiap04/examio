import { BadRequestException } from '@nestjs/common';
import { FlashcardsetService } from './flashcardset.service';

const BASE = 'https://cdn.examio.test';
const AREA = 'flashcardset-thumbnails';
const user = { id: 'u1' } as never;

/**
 * `thumbnail` is the stored value of the row being deleted/updated; `refs` is how many
 * rows of the same owner still reference it after the write.
 */
function setup(thumbnail: string | null, refs = 0) {
    const tx = { marker: 'tx' };
    const events: string[] = [];
    const counts: unknown[] = [];
    const txClient = {
        marker: 'tx',
        flashCardSet: {
            findUnique: jest.fn(async () => ({ thumbnail })),
            count: jest.fn(async (args: unknown) => {
                counts.push(args);
                return refs;
            }),
        },
    };
    const prisma = {
        $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => {
            events.push('begin');
            const out = await fn(txClient);
            events.push('commit');
            return out;
        }),
        flashCardSet: { findUnique: jest.fn(async () => ({ id: 's1', tag: [] })) },
    };
    const repo = {
        findOne: jest.fn(async () => ({ id: 's1', userId: 'u1', thumbnail })),
        delete: jest.fn(async (...a: unknown[]) => {
            events.push(`delete tx=${a[2] === txClient}`);
            return { id: 's1', userId: 'u1', thumbnail };
        }),
        update: jest.fn(async (...a: unknown[]) => {
            events.push(`update tx=${a[3] === txClient}`);
            return { id: 's1' };
        }),
        invalidateWrite: jest.fn(async () => {
            events.push('invalidate');
        }),
        create: jest.fn(async () => ({ id: 's1', tag: [] })),
    };
    const writer = {
        enqueue: jest.fn(async (t: unknown, keys: unknown[]) => {
            events.push(`enqueue tx=${t === txClient} keys=${JSON.stringify(keys)}`);
            return keys.length;
        }),
    };
    const r2 = {
        deleteFile: jest.fn(),
        uploadFile: jest.fn(async (_n: string, _b: unknown, _m: string, folder: string) => `${folder}/new.png`),
        getPublicUrl: (k: string) => `${BASE}/${k}`,
    };
    const service = new FlashcardsetService(
        prisma as never,
        repo as never,
        { generateId: () => 'id' } as never,
        r2 as never,
        {} as never,
        {} as never,
        writer as never
    );
    void tx;
    return { service, events, r2, writer, repo, counts };
}

const file = { buffer: Buffer.from('x'), originalname: 'n.png', mimetype: 'image/png' };

describe('FlashcardsetService durable, owner-scoped R2 deletes', () => {
    beforeEach(() => {
        process.env.R2_PUBLIC_URL = BASE;
    });

    it('delete: row delete (returning the row) and task insert share one tx; key comes from the in-tx row', async () => {
        const { service, events, r2, counts } = setup(`${BASE}/${AREA}/u1/a.png`);
        await service.deleteFlashcardSet('s1', user);
        expect(events).toEqual([
            'begin',
            'delete tx=true',
            `enqueue tx=true keys=["${AREA}/u1/a.png"]`,
            'commit',
            'invalidate',
        ]);
        expect(counts).toEqual([{ where: { userId: 'u1', thumbnail: `${BASE}/${AREA}/u1/a.png` } }]);
        expect(r2.deleteFile).not.toHaveBeenCalled();
    });

    it('H2: delete never queues a key under another owner prefix (planted foreign thumbnail)', async () => {
        const { service, writer } = setup(`${BASE}/${AREA}/victim/a.png`);
        await service.deleteFlashcardSet('s1', user);
        expect(writer.enqueue).toHaveBeenCalledWith(expect.anything(), [null]);
    });

    it('H2: delete never queues a legacy owner-less key', async () => {
        const { service, writer } = setup(`${BASE}/${AREA}/1700000000-a.png`);
        await service.deleteFlashcardSet('s1', user);
        expect(writer.enqueue).toHaveBeenCalledWith(expect.anything(), [null]);
    });

    it('H2: delete keeps the object while another row of the owner still references it', async () => {
        const { service, writer } = setup(`${BASE}/${AREA}/u1/a.png`, 1);
        await service.deleteFlashcardSet('s1', user);
        expect(writer.enqueue).toHaveBeenCalledWith(expect.anything(), [null]);
    });

    it('delete: an external thumbnail is never queued', async () => {
        const { service, writer } = setup('https://elsewhere.test/a.png');
        await service.deleteFlashcardSet('s1', user);
        expect(writer.enqueue).toHaveBeenCalledWith(expect.anything(), [null]);
    });

    it('update with a new file: stores under <area>/<owner>, old own key queued from the in-tx row', async () => {
        const { service, events, r2 } = setup(`${BASE}/${AREA}/u1/old.png`);
        await service.updateFlashcardSet('s1', user, {} as never, file as never);
        expect(r2.uploadFile).toHaveBeenCalledWith(
            expect.stringMatching(/-n\.png$/),
            expect.anything(),
            'image/png',
            `${AREA}/u1`,
            expect.anything()
        );
        expect(events).toEqual([
            'begin',
            'update tx=true',
            `enqueue tx=true keys=["${AREA}/u1/old.png"]`,
            'commit',
            'invalidate',
        ]);
    });

    it('H2: update with a new file never queues a legacy/foreign old key', async () => {
        const { service, writer } = setup(`${BASE}/${AREA}/victim/old.png`);
        await service.updateFlashcardSet('s1', user, {} as never, file as never);
        expect(writer.enqueue).toHaveBeenCalledWith(expect.anything(), [null]);
    });

    it('H2: update rejects a client-supplied R2 thumbnail outside the caller prefix', async () => {
        const { service, repo } = setup(null);
        for (const thumbnail of [
            `${BASE}/${AREA}/victim/a.png`,
            `${BASE}/${AREA}/legacy.png`,
        ]) {
            await expect(
                service.updateFlashcardSet('s1', user, { thumbnail } as never)
            ).rejects.toBeInstanceOf(BadRequestException);
        }
        expect(repo.update).not.toHaveBeenCalled();
    });

    it('update keeps accepting the unchanged stored value and external URLs', async () => {
        const legacy = `${BASE}/${AREA}/legacy.png`;
        const { service, repo } = setup(legacy);
        await service.updateFlashcardSet('s1', user, { thumbnail: legacy } as never);
        await service.updateFlashcardSet('s1', user, { thumbnail: 'https://ext.test/a.png' } as never);
        expect(repo.update).toHaveBeenCalledTimes(2);
    });

    it('H2: create rejects a foreign R2 thumbnail and accepts own-prefix/external ones', async () => {
        const { service, repo } = setup(null);
        await expect(
            service.createFlashcardSet(user, { title: 't', thumbnail: `${BASE}/${AREA}/victim/a.png` } as never)
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.create).not.toHaveBeenCalled();
        await service.createFlashcardSet(user, { title: 't', thumbnail: `${BASE}/${AREA}/u1/a.png` } as never);
        await service.createFlashcardSet(user, { title: 't', thumbnail: 'https://ext.test/a.png' } as never);
        expect(repo.create).toHaveBeenCalledTimes(2);
    });

    it('create with a file uploads under <area>/<owner>', async () => {
        const { service, r2 } = setup(null);
        await service.createFlashcardSet(user, { title: 't' } as never, file as never);
        expect(r2.uploadFile).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            'image/png',
            `${AREA}/u1`,
            expect.anything()
        );
    });
});
