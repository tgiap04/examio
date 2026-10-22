import { status } from '@grpc/grpc-js';
import { buildMetadata } from '@examio/grpc';
import { WordFamilyAdminService } from './word-family-admin.service';
import { r2KeyFromUrl } from './r2-key-from-url';

const BASE = 'https://cdn.example.test';
const row = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    name: 'Shopping',
    slug: 'shopping',
    description: null,
    imageUrl: `${BASE}/word-family/shop.png`,
    order: 1,
    isActive: true,
    createdAt: new Date(1_700_000_000_000),
    updatedAt: new Date(1_700_000_100_000),
    ...over,
});

function setup() {
    const repo = {
        listCategories: jest.fn(async (_inactive: boolean) => [row()]),
        findCategoryById: jest.fn(async (_id: string): Promise<ReturnType<typeof row> | null> => row()),
        findCategoryBySlug: jest.fn(async (_s: string): Promise<ReturnType<typeof row> | null> => null),
        createCategory: jest.fn(async (d: Record<string, unknown>) => row(d)),
        updateCategory: jest.fn(async (_id: string, d: Record<string, unknown>) => row(d)),
    };
    const r2 = { deleteFile: jest.fn(async (..._a: unknown[]) => undefined) };
    const service = new WordFamilyAdminService(repo as never, r2 as never, BASE);
    return { service, repo, r2 };
}
const codeOf = async (p: Promise<unknown>) =>
    (await p.then(() => null, (e) => e))?.getError?.().code;

describe('r2KeyFromUrl', () => {
    it('returns the key only for URLs on the R2 public host', () => {
        expect(r2KeyFromUrl(`${BASE}/word-family/a b.png`, BASE)).toBe('word-family/a b.png');
        expect(r2KeyFromUrl('https://other.test/word-family/a.png', BASE)).toBeNull();
        expect(r2KeyFromUrl(`${BASE}.evil.test/x.png`, BASE)).toBeNull();
        expect(r2KeyFromUrl(null, BASE)).toBeNull();
        expect(r2KeyFromUrl('', BASE)).toBeNull();
        expect(r2KeyFromUrl(`${BASE}/`, BASE)).toBeNull();
    });
});

describe('WordFamilyAdminService', () => {
    it('lists with timestamps as epoch-ms strings and nulls as empty strings', async () => {
        const { service, repo } = setup();
        repo.listCategories.mockResolvedValue([row({ description: null, imageUrl: null })]);
        const res = await service.listCategories({ includeInactive: true });
        expect(repo.listCategories).toHaveBeenCalledWith(true);
        expect(res.categories[0]).toMatchObject({
            id: 'c1', description: '', imageUrl: '',
            createdAt: '1700000000000', updatedAt: '1700000100000',
        });
    });

    describe('upsert (create)', () => {
        it('creates with defaults', async () => {
            const { service, repo } = setup();
            await service.upsertCategory({ id: '', name: 'Shop', slug: 'shop' });
            expect(repo.createCategory).toHaveBeenCalledWith({
                name: 'Shop', slug: 'shop', description: undefined, imageUrl: undefined, order: undefined,
            });
        });

        it('a taken slug is ALREADY_EXISTS', async () => {
            const { service, repo } = setup();
            repo.findCategoryBySlug.mockResolvedValue(row());
            expect(await codeOf(service.upsertCategory({ id: '', name: 'Shop', slug: 'shopping' }))).toBe(status.ALREADY_EXISTS);
            expect(repo.createCategory).not.toHaveBeenCalled();
        });

        it.each([
            [{ name: '', slug: 'ok' }],
            [{ name: 'x', slug: 'Bad Slug' }],
            [{ name: 'x', slug: 'ok', order: -1 }],
            [{ name: 'x', slug: 'ok', imageUrl: 'not a url' }],
        ])('invalid input %j is INVALID_ARGUMENT', async (bad) => {
            const { service, repo } = setup();
            expect(await codeOf(service.upsertCategory({ id: '', ...bad } as never))).toBe(status.INVALID_ARGUMENT);
            expect(repo.createCategory).not.toHaveBeenCalled();
        });
    });

    describe('upsert (update)', () => {
        it('only the provided fields change; the slug is immutable', async () => {
            const { service, repo } = setup();
            await service.upsertCategory({ id: 'c1', name: 'New', slug: '', order: 4, isActive: false });
            expect(repo.updateCategory).toHaveBeenCalledWith('c1', { name: 'New', order: 4, isActive: false });
            expect(await codeOf(service.upsertCategory({ id: 'c1', name: 'x', slug: 'other' }))).toBe(status.INVALID_ARGUMENT);
        });

        it('unknown id is NOT_FOUND', async () => {
            const { service, repo } = setup();
            repo.findCategoryById.mockResolvedValue(null);
            expect(await codeOf(service.upsertCategory({ id: 'zz', name: 'x', slug: '' }))).toBe(status.NOT_FOUND);
        });

        it('replacing the image deletes the OLD R2 object after the row is updated', async () => {
            const { service, repo, r2 } = setup();
            await service.upsertCategory({ id: 'c1', name: 'Shopping', slug: '', imageUrl: `${BASE}/word-family/new.png` });
            expect(r2.deleteFile).toHaveBeenCalledTimes(1);
            expect(r2.deleteFile.mock.calls[0][0]).toBe('word-family/shop.png');
            expect(repo.updateCategory.mock.invocationCallOrder[0]).toBeLessThan(r2.deleteFile.mock.invocationCallOrder[0]);
        });

        it('the same image URL deletes nothing', async () => {
            const { service, r2 } = setup();
            await service.upsertCategory({ id: 'c1', name: 'Shopping', slug: '', imageUrl: `${BASE}/word-family/shop.png` });
            expect(r2.deleteFile).not.toHaveBeenCalled();
        });

        it('a failing R2 cleanup of the old image does not fail the saved update (logged)', async () => {
            const { service, r2 } = setup();
            r2.deleteFile.mockRejectedValue(new Error('r2 down'));
            await expect(
                service.upsertCategory({ id: 'c1', name: 'Shopping', slug: '', imageUrl: `${BASE}/word-family/new.png` })
            ).resolves.toBeDefined();
        });
    });

    describe('delete', () => {
        it('deletes the R2 image FIRST (idempotent, so a retry is safe), then soft-deactivates and clears the URL', async () => {
            const { service, repo, r2 } = setup();
            const res = await service.deleteCategory({ id: 'c1' });
            expect(r2.deleteFile.mock.calls[0][0]).toBe('word-family/shop.png');
            expect(repo.updateCategory).toHaveBeenCalledWith('c1', { isActive: false, imageUrl: null });
            expect(r2.deleteFile.mock.invocationCallOrder[0]).toBeLessThan(repo.updateCategory.mock.invocationCallOrder[0]);
            expect(res.category?.id).toBe('c1');
        });

        it('an R2 failure aborts the delete and leaves the row untouched', async () => {
            const { service, repo, r2 } = setup();
            r2.deleteFile.mockRejectedValue(new Error('r2 down'));
            await expect(service.deleteCategory({ id: 'c1' })).rejects.toThrow('r2 down');
            expect(repo.updateCategory).not.toHaveBeenCalled();
        });

        it('a category without an R2-hosted image makes no R2 call', async () => {
            const { service, repo, r2 } = setup();
            repo.findCategoryById.mockResolvedValue(row({ imageUrl: 'https://elsewhere.test/a.png' }));
            await service.deleteCategory({ id: 'c1' });
            expect(r2.deleteFile).not.toHaveBeenCalled();
            expect(repo.updateCategory).toHaveBeenCalledWith('c1', { isActive: false, imageUrl: null });
        });

        it.each(['documents/u1/secret.pdf', 'images/u1/avatar.png', 'word-family/../documents/u1/a.pdf'])(
            'an admin-set URL pointing at another R2 area (%s) is never deleted, but the category still deactivates',
            async (key) => {
                const { service, repo, r2 } = setup();
                repo.findCategoryById.mockResolvedValue(row({ imageUrl: `${BASE}/${key}` }));
                await service.deleteCategory({ id: 'c1' });
                expect(r2.deleteFile).not.toHaveBeenCalled();
                expect(repo.updateCategory).toHaveBeenCalledWith('c1', { isActive: false, imageUrl: null });
            }
        );

        it('replacing an image that points outside the word-family prefix deletes nothing', async () => {
            const { service, repo, r2 } = setup();
            repo.findCategoryById.mockResolvedValue(row({ imageUrl: `${BASE}/documents/u1/secret.pdf` }));
            await service.upsertCategory({ id: 'c1', name: 'Shopping', slug: '', imageUrl: `${BASE}/word-family/new.png` });
            expect(r2.deleteFile).not.toHaveBeenCalled();
        });

        it('unknown id is NOT_FOUND and touches nothing', async () => {
            const { service, repo, r2 } = setup();
            repo.findCategoryById.mockResolvedValue(null);
            expect(await codeOf(service.deleteCategory({ id: 'zz' }))).toBe(status.NOT_FOUND);
            expect(r2.deleteFile).not.toHaveBeenCalled();
            expect(repo.updateCategory).not.toHaveBeenCalled();
        });
    });
});

describe('WordFamilyAdminService duplicate name', () => {
    const p2002 = () => {
        const { Prisma } = require('@prisma/client');
        return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['name'] },
        });
    };

    it('create: a taken name is ALREADY_EXISTS, not UNKNOWN', async () => {
        const { service, repo } = setup();
        repo.createCategory.mockRejectedValue(p2002());
        expect(await codeOf(service.upsertCategory({ id: '', name: 'Shopping', slug: 'new-slug' }))).toBe(status.ALREADY_EXISTS);
    });

    it('update: a taken name is ALREADY_EXISTS, not UNKNOWN', async () => {
        const { service, repo } = setup();
        repo.updateCategory.mockRejectedValue(p2002());
        expect(await codeOf(service.upsertCategory({ id: 'c1', name: 'Travel', slug: '' }))).toBe(status.ALREADY_EXISTS);
    });

    it('other errors are not swallowed', async () => {
        const { service, repo } = setup();
        repo.createCategory.mockRejectedValue(new Error('db down'));
        await expect(service.upsertCategory({ id: '', name: 'x', slug: 'ok' })).rejects.toThrow('db down');
    });
});
