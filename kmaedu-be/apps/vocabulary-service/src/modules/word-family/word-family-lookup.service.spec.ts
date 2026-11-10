import { status } from '@grpc/grpc-js';
import { WordFamilyLookupService } from './word-family-lookup.service';
import type { WordFamilyRepository } from './word-family.repository';

const row = (data: unknown) => ({
    id: 'wf1',
    rootWord: 'order',
    categoryId: 'c1',
    categorySlug: 'shopping',
    data,
    createdAt: new Date(),
    updatedAt: new Date(),
});

function setup(family: ReturnType<typeof row> | null, categoryName: string | null = 'Mua sắm') {
    const repo = {
        findWordFamilyById: jest.fn().mockResolvedValue(family),
        findCategoryBySlug: jest
            .fn()
            .mockResolvedValue(categoryName ? { name: categoryName } : null),
    };
    return {
        repo,
        service: new WordFamilyLookupService(repo as unknown as WordFamilyRepository),
    };
}

const expectRpc = async (promise: Promise<unknown>, code: status) =>
    expect(promise).rejects.toMatchObject({ error: { code } });

describe('WordFamilyLookupService', () => {
    it('returns the family with its category name and typed words', async () => {
        const { service } = setup(
            row({
                rootWord: 'order',
                categorySlug: 'shopping',
                words: [
                    { word: 'order', pos: 'v', meaningEn: 'x', meaningVi: 'đặt', example: 'e' },
                    { word: 'orderly', pos: 'adj' },
                ],
            })
        );
        const res = await service.getWordFamily('wf1');
        expect(res.wordFamily).toEqual({
            id: 'wf1',
            rootWord: 'order',
            categorySlug: 'shopping',
            categoryName: 'Mua sắm',
            words: [
                { word: 'order', pos: 'v', meaningEn: 'x', meaningVi: 'đặt', example: 'e' },
                { word: 'orderly', pos: 'adj', meaningEn: '', meaningVi: '', example: '' },
            ],
        });
    });

    it('falls back to the slug when the category row is gone', async () => {
        const { service } = setup(
            row({ rootWord: 'order', categorySlug: 'shopping', words: [] }),
            null
        );
        expect((await service.getWordFamily('wf1')).wordFamily?.categoryName).toBe('shopping');
    });

    it('NOT_FOUND for an unknown id', async () => {
        const { service } = setup(null);
        await expectRpc(service.getWordFamily('nope'), status.NOT_FOUND);
    });

    it('INVALID_ARGUMENT for an empty id (no lookup)', async () => {
        const { service, repo } = setup(null);
        await expectRpc(service.getWordFamily(''), status.INVALID_ARGUMENT);
        expect(repo.findWordFamilyById).not.toHaveBeenCalled();
    });

    it.each([[null], [{ rootWord: 'order' }], [{ words: [] }]])(
        'FAILED_PRECONDITION for an unusable payload %j',
        async (data) => {
            const { service } = setup(row(data));
            await expectRpc(service.getWordFamily('wf1'), status.FAILED_PRECONDITION);
        }
    );
});
