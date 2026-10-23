import { ConflictException } from '@nestjs/common';
import { AIRepository } from './ai.repository';

const data = {
    id: 'new',
    userId: 'u1',
    filename: 'a.pdf',
    url: 'https://x/a.pdf',
    mimetype: 'application/pdf',
    size: 1,
    keyR2: 'ai-uploads/u1/a.pdf',
};

function setup(opts: { createError?: unknown; updated?: number }) {
    const userStorage = {
        create: jest.fn(async () => {
            if (opts.createError) throw opts.createError;
            return { id: 'new' };
        }),
        upsert: jest.fn(),
        updateMany: jest.fn(async () => ({ count: opts.updated ?? 0 })),
        findUniqueOrThrow: jest.fn(async () => ({ id: 'old', userId: 'u1' })),
    };
    return { repo: new AIRepository({ userStorage } as never), userStorage };
}

describe('AIRepository.createUserStorage', () => {
    it('creates a fresh row without upserting on the key', async () => {
        const { repo, userStorage } = setup({});
        await expect(repo.createUserStorage(data)).resolves.toEqual({ id: 'new' });
        expect(userStorage.upsert).not.toHaveBeenCalled();
    });

    it('H3: a key owned by ANOTHER user is a 409 and never resets that row', async () => {
        const { repo, userStorage } = setup({ createError: { code: 'P2002' }, updated: 0 });
        await expect(repo.createUserStorage(data)).rejects.toBeInstanceOf(ConflictException);
        expect(userStorage.updateMany).toHaveBeenCalledWith({
            where: { keyR2: data.keyR2, userId: 'u1' },
            data: expect.objectContaining({ processingStatus: 'PENDING' }),
        });
        expect(userStorage.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('retry of the caller own failed upload resets only that row', async () => {
        const { repo } = setup({ createError: { code: 'P2002' }, updated: 1 });
        await expect(repo.createUserStorage(data)).resolves.toEqual({ id: 'old', userId: 'u1' });
    });

    it('rethrows unrelated errors', async () => {
        const boom = new Error('db down');
        const { repo } = setup({ createError: boom });
        await expect(repo.createUserStorage(data)).rejects.toBe(boom);
    });
});
