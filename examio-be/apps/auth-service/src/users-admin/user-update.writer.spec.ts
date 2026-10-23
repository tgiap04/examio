import { BadRequestException } from '@nestjs/common';
import { UserUpdateWriter } from './user-update.writer';

const BASE = 'https://cdn.examio.test';

function setup(existing: Record<string, unknown> | null) {
    const tx = {
        user: {
            findUnique: jest.fn(async () => existing),
            update: jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...existing, ...args.data })),
        },
    };
    const events: string[] = [];
    const prisma = {
        $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => {
            events.push('begin');
            const out = await fn(tx);
            events.push('commit');
            return out;
        }),
    };
    const users = { invalidateCaches: jest.fn(async () => undefined) };
    const publisher = { publish: jest.fn(async () => undefined) };
    const r2Deletes = {
        enqueue: jest.fn(async (t: unknown, keys: unknown[]) => {
            events.push(`enqueue tx=${t === tx} ${JSON.stringify(keys)}`);
            return keys.length;
        }),
    };
    const writer = new UserUpdateWriter(prisma as never, users as never, publisher as never, r2Deletes as never);
    return { writer, events, r2Deletes };
}

describe('UserUpdateWriter durable R2 deletes', () => {
    beforeEach(() => {
        process.env.R2_PUBLIC_URL = BASE;
    });

    it('queues the replaced avatar and banner keys in the same tx as the row update', async () => {
        const { writer, events } = setup({
            id: 'u1',
            avatar: `${BASE}/avatars/u1/old-a.png`,
            banner: `${BASE}/banners/u1/old-b.png`,
        });
        await writer.update(
            'u1',
            { avatar: `${BASE}/avatars/u1/new-a.png`, banner: `${BASE}/banners/u1/new-b.png` },
            'u1'
        );
        expect(events).toEqual([
            'begin',
            'enqueue tx=true ["avatars/u1/old-a.png","banners/u1/old-b.png"]',
            'commit',
        ]);
    });

    it('never queues an external (non-R2) old avatar or an unchanged one', async () => {
        const { writer, r2Deletes } = setup({ id: 'u1', avatar: 'https://lh3.googleusercontent.com/a.png', banner: null });
        await writer.update('u1', { avatar: `${BASE}/avatars/u1/new.png` }, 'u1');
        expect(r2Deletes.enqueue).toHaveBeenCalledWith(expect.anything(), [null]); // unresolved -> writer drops it
        r2Deletes.enqueue.mockClear();
        await writer.update('u1', { avatar: 'https://lh3.googleusercontent.com/a.png' }, 'u1');
        expect(r2Deletes.enqueue).not.toHaveBeenCalled();
    });

    it('H1: a victim URL set as avatar is rejected, so it can never be queued later', async () => {
        const { writer, r2Deletes } = setup({ id: 'u1', avatar: null, banner: null });
        await expect(
            writer.update('u1', { avatar: `${BASE}/avatars/victim/a.png` }, 'u1')
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            writer.update('u1', { banner: `${BASE}/avatars/u1/a.png` }, 'u1')
        ).rejects.toBeInstanceOf(BadRequestException); // wrong area
        await expect(
            writer.update('u1', { avatar: `${BASE}/avatars/old-ownerless.png` }, 'u1')
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(r2Deletes.enqueue).not.toHaveBeenCalled();
    });

    it('F11: an avatar with %2e%2e or %2E%2E traversal into another owner prefix is rejected, never stored or queued', async () => {
        const { writer, r2Deletes } = setup({ id: 'u1', avatar: null, banner: null });
        for (const enc of ['%2e%2e', '%2E%2E']) {
            await expect(
                writer.update('u1', { avatar: `${BASE}/avatars/u1/${enc}/victim/a.png` }, 'u1')
            ).rejects.toBeInstanceOf(BadRequestException);
        }
        expect(r2Deletes.enqueue).not.toHaveBeenCalled();
    });

    it('F11: avatar URLs that normalise into another owner prefix (empty segment, tab/newline, upper-case host, explicit :443) are rejected', async () => {
        const { writer, r2Deletes } = setup({ id: 'u1', avatar: null, banner: null });
        const bad = [
            `${BASE}/avatars/u1//victim/a.png`,
            `${BASE}/avatars/u1/.\t./victim/a.png`,
            `${BASE}/avatars/u1/.\n./victim/a.png`,
            `HTTPS://CDN.EXAMIO.TEST/avatars/victim/a.png`,
            `https://cdn.examio.test:443/avatars/victim/a.png`,
        ];
        for (const avatar of bad) {
            await expect(writer.update('u1', { avatar }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
        }
        expect(r2Deletes.enqueue).not.toHaveBeenCalled();
    });

    it('H1: an old avatar that is not under the row owner prefix is never queued', async () => {
        const { writer, r2Deletes } = setup({
            id: 'u1',
            avatar: `${BASE}/avatars/victim/a.png`, // planted before the fix
            banner: `${BASE}/banners/legacy-ownerless.png`,
        });
        await writer.update('u1', { avatar: `${BASE}/avatars/u1/new.png`, banner: 'https://ext.test/b.png' }, 'u1');
        expect(r2Deletes.enqueue).toHaveBeenCalledWith(expect.anything(), [null, null]);
    });

    it('H1: an old avatar object still referenced by the same row banner is kept', async () => {
        const shared = `${BASE}/avatars/u1/shared.png`;
        const { writer, r2Deletes } = setup({ id: 'u1', avatar: shared, banner: shared });
        await writer.update('u1', { avatar: `${BASE}/avatars/u1/new.png` }, 'u1');
        expect(r2Deletes.enqueue).toHaveBeenCalledWith(expect.anything(), [null]);
    });

    it('keeps accepting an unchanged legacy value and external URLs', async () => {
        const legacy = `${BASE}/avatars/legacy.png`;
        const { writer } = setup({ id: 'u1', avatar: legacy, banner: null });
        await expect(writer.update('u1', { avatar: legacy, banner: 'https://ext.test/b.png' }, 'u1')).resolves.toBeTruthy();
    });

    it('does not enqueue for a missing user', async () => {
        const { writer, r2Deletes } = setup(null);
        await expect(writer.update('u1', { avatar: 'x' }, 'u1')).resolves.toBeNull();
        expect(r2Deletes.enqueue).not.toHaveBeenCalled();
    });
});
