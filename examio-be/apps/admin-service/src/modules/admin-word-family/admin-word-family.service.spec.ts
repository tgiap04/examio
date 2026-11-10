import { HttpException } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { AdminWordFamilyService } from './admin-word-family.service';

const md = new Metadata();
md.set('authorization', 'Bearer admin-token');
const ctx = { adminId: 'admin1', ipAddress: '1.1.1.1', userAgent: 'jest' };

const cat = (over: Record<string, unknown> = {}) => ({
    id: 'c1', name: 'Shopping', slug: 'shopping', description: '', imageUrl: '', order: 0, isActive: true,
    createdAt: '1700000000000', updatedAt: '1700000001000', ...over,
});

function setup() {
    const vocab = {
        listCategories: jest.fn(async () => ({ categories: [cat()] })),
        upsertCategory: jest.fn(async (req: Record<string, unknown>) => ({ category: cat({ ...req, id: (req.id as string) || 'c9' }) })),
        deleteCategory: jest.fn(async () => ({ category: cat({ isActive: false }) })),
    };
    const audit = { write: jest.fn(async () => undefined) };
    return { service: new AdminWordFamilyService(audit as never, vocab as never), vocab, audit };
}

describe('AdminWordFamilyService (WordFamilyAdminService over gRPC, admin token forwarded)', () => {
    it('lists every category including inactive ones, in the legacy row shape (null for empty text, Date timestamps)', async () => {
        const { service, vocab } = setup();
        const rows = await service.listCategories(md);
        expect(vocab.listCategories).toHaveBeenCalledWith({ includeInactive: true }, md);
        expect(rows).toEqual([
            { id: 'c1', name: 'Shopping', slug: 'shopping', description: null, imageUrl: null, order: 0, isActive: true, createdAt: new Date(1_700_000_000_000), updatedAt: new Date(1_700_000_001_000) },
        ]);
    });

    it('create: upsert with an empty id, then one audit row (409 from the server propagates with no audit)', async () => {
        const { service, vocab, audit } = setup();
        const created = await service.createCategory({ name: 'Travel', slug: 'travel', order: 2 }, ctx, md);
        expect(vocab.upsertCategory).toHaveBeenCalledWith(
            { id: '', name: 'Travel', slug: 'travel', description: undefined, imageUrl: undefined, order: 2 },
            md
        );
        expect(created).toMatchObject({ id: 'c9', slug: 'travel' });
        expect(audit.write).toHaveBeenCalledWith(
            expect.objectContaining({ adminId: 'admin1', action: 'admin.wordFamily.category.create', targetId: 'c9', payload: { name: 'Travel', slug: 'travel' } })
        );

        audit.write.mockClear();
        vocab.upsertCategory.mockRejectedValueOnce(new HttpException({ statusCode: 409, code: 'ALREADY_EXISTS' }, 409));
        await expect(service.createCategory({ name: 'Travel', slug: 'travel' }, ctx, md)).rejects.toMatchObject({ status: 409 });
        expect(audit.write).not.toHaveBeenCalled();
    });

    it('update: merges onto the current row (slug is immutable), skips unchanged fields, one audit row per changed field', async () => {
        const { service, vocab, audit } = setup();
        const res = await service.updateCategory('c1', { name: 'Shop', order: 0, isActive: false }, ctx, md);
        expect(vocab.upsertCategory).toHaveBeenCalledWith(
            { id: 'c1', name: 'Shop', slug: 'shopping', description: undefined, imageUrl: undefined, order: 0, isActive: false },
            md
        );
        expect(res).toMatchObject({ id: 'c1', name: 'Shop', isActive: false });
        expect(audit.write.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
            expect.objectContaining({ action: 'admin.wordFamily.category.update', targetId: 'c1', payload: { field: 'name', from: 'Shopping', to: 'Shop' } }),
            expect.objectContaining({ action: 'admin.wordFamily.category.update', targetId: 'c1', payload: { field: 'isActive', from: true, to: false } }),
        ]);
    });

    it('update: no change makes no write RPC and no audit; an unknown id is 404', async () => {
        const { service, vocab, audit } = setup();
        const same = await service.updateCategory('c1', { name: 'Shopping' }, ctx, md);
        expect(same).toMatchObject({ id: 'c1' });
        expect(vocab.upsertCategory).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
        await expect(service.updateCategory('ghost', { name: 'x' }, ctx, md)).rejects.toMatchObject({ status: 404 });
    });

    it('delete: DeleteCategory with the token, legacy response shape, one audit row', async () => {
        const { service, vocab, audit } = setup();
        const res = await service.deleteCategory('c1', ctx, md);
        expect(vocab.deleteCategory).toHaveBeenCalledWith({ id: 'c1' }, md);
        expect(res).toMatchObject({ message: 'Category deleted', category: { id: 'c1', isActive: false } });
        expect(audit.write).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'admin.wordFamily.category.delete', targetId: 'c1', payload: { name: 'Shopping', slug: 'shopping', previousIsActive: true } })
        );
    });

    it('an audit failure after the committed RPC is logged, not returned as an error', async () => {
        const { service, audit } = setup();
        audit.write.mockRejectedValue(new Error('audit db down'));
        await expect(service.deleteCategory('c1', ctx, md)).resolves.toMatchObject({ message: 'Category deleted' });
    });
});
