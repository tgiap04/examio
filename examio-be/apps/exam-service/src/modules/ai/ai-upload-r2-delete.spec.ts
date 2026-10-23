import { BadRequestException } from '@nestjs/common';
import { AIService } from './ai.service';

function setup(keyR2: string, ownerId = 'u1') {
    const tx = { marker: 'tx' };
    const events: string[] = [];
    const repo = {
        findUserStorageById: jest.fn(async () => ({ id: 'up1', userId: ownerId, keyR2 })),
        createUserStorage: jest.fn(async () => ({ id: 'id' })),
        updateUserStorageStatus: jest.fn(async () => ({})),
        countUserStorageThisMonth: jest.fn(async () => 0),
        deleteUploadAggregate: jest.fn(async (_id: string, inTx?: (t: unknown) => Promise<unknown>) => {
            events.push('begin');
            await inTx?.(tx);
            events.push('commit');
            return { documents: 0, documentEntities: 0, aiChatDocuments: 0 };
        }),
    };
    const writer = {
        enqueue: jest.fn(async (t: unknown, keys: unknown[]) => {
            events.push(`enqueue tx=${t === tx} ${JSON.stringify(keys)}`);
            return keys.length;
        }),
    };
    const r2 = { deleteFile: jest.fn() };
    const http = { post: jest.fn(), delete: jest.fn() };
    const finance = {
        deductCredits: jest.fn(async () => ({ success: true, newBalance: 1 })),
        getUserBenefits: jest.fn(async () => ({ filesPerMonth: -1 })),
    };
    const service = new AIService(
        repo as never,
        { generateId: () => 'id' } as never,
        http as never,
        finance as never,
        r2 as never,
        { del: jest.fn(), get: jest.fn(), set: jest.fn() } as never,
        writer as never
    );
    jest.spyOn(service as unknown as { clearAiServiceCache: () => Promise<void> }, 'clearAiServiceCache').mockResolvedValue();
    jest.spyOn(service as unknown as { processFileAsync: () => Promise<void> }, 'processFileAsync').mockResolvedValue();
    return { service, events, r2, repo, finance, writer };
}

describe('AIService.deleteUpload durable, owner-scoped R2 delete', () => {
    it.each(['ai-uploads', 'ai-teacher'])(
        'queues the owner-scoped %s key inside the aggregate delete tx and never calls R2',
        async (area) => {
            const { service, events, r2 } = setup(`${area}/u1/a.pdf`);
            await expect(service.deleteUpload('up1', { id: 'u1' } as never)).resolves.toEqual({
                success: true,
                message: 'Xóa thành công',
            });
            expect(events).toEqual(['begin', `enqueue tx=true ["${area}/u1/a.pdf"]`, 'commit']);
            expect(r2.deleteFile).not.toHaveBeenCalled();
        }
    );

    it('H3: never queues a key outside the row owner prefix (planted foreign key) or a legacy key', async () => {
        for (const key of ['ai-uploads/victim/a.pdf', 'avatars/victim/a.png', 'ai-uploads/legacy.pdf', 'documents/u1/a.pdf']) {
            const { service, writer } = setup(key);
            await service.deleteUpload('up1', { id: 'u1' } as never);
            expect(writer.enqueue).toHaveBeenCalledWith(expect.anything(), [null]);
        }
    });
});

describe('AIService.createUpload keyR2 validation', () => {
    const dto = (keyR2: string) =>
        ({ filename: 'a.pdf', url: 'https://x/a.pdf', mimetype: 'application/pdf', size: 4 * 1024 * 1024, keyR2 }) as never;

    it('H3: rejects a client keyR2 outside the caller prefix before charging or writing anything', async () => {
        for (const key of ['ai-uploads/victim/a.pdf', 'ai-uploads/legacy.pdf', 'avatars/u1/a.png', 'ai-uploads/u1/../victim/a.pdf', '']) {
            const { service, repo, finance } = setup('x');
            await expect(service.createUpload({ id: 'u1' } as never, dto(key))).rejects.toBeInstanceOf(
                BadRequestException
            );
            expect(finance.deductCredits).not.toHaveBeenCalled();
            expect(repo.createUserStorage).not.toHaveBeenCalled();
        }
    });

    it('accepts a key under the caller own ai-uploads/ai-teacher prefix', async () => {
        for (const key of ['ai-uploads/u1/a.pdf', 'ai-teacher/u1/a.pdf']) {
            const { service, repo } = setup('x');
            await service.createUpload({ id: 'u1' } as never, dto(key));
            expect(repo.createUserStorage).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', keyR2: key }));
        }
    });
});

describe('AIService server-issued upload keys', () => {
    const file = { originalname: 'Doc.pdf', size: 10, buffer: Buffer.from('x'), mimetype: 'application/pdf' };

    it('quickUpload stores under ai-teacher/<userId>', async () => {
        const { service, repo } = setup('x');
        const r2 = { uploadFile: jest.fn(async (_n: string, _b: unknown, _m: string, folder: string) => `${folder}/k.pdf`), getPublicUrl: (k: string) => `https://cdn/${k}` };
        (service as unknown as { r2ClientService: unknown }).r2ClientService = r2;
        await service.quickUpload({ id: 'u1' } as never, file as never);
        expect(r2.uploadFile).toHaveBeenCalledWith(expect.any(String), expect.anything(), 'application/pdf', 'ai-teacher/u1', expect.anything());
        expect(repo.createUserStorage).toHaveBeenCalledWith(expect.objectContaining({ keyR2: 'ai-teacher/u1/k.pdf' }));
    });
});
