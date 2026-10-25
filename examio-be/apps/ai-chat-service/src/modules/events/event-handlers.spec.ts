import { PermanentEventError, type Envelope } from '@examio/messaging';
import { DocumentDeletedHandler } from './document-deleted.handler';
import { SubscriptionChangedHandler } from './subscription-changed.handler';

const envelope = (type: string, data: unknown) => ({ id: 'e1', type, source: type.split('.')[0], version: 1, data }) as unknown as Envelope;

describe('DocumentDeletedHandler', () => {
    const tx = { marker: 'tx' } as never;

    it('deletes the links of the deleted documents inside the consumer tx', async () => {
        const chats = { deleteLinksOfDocuments: jest.fn().mockResolvedValue(2) };
        await new DocumentDeletedHandler(chats as never).onDocumentDeleted(
            envelope('document.deleted', { storageIds: ['d1', 'd2'], userId: 'u1' }),
            tx
        );
        expect(chats.deleteLinksOfDocuments).toHaveBeenCalledWith(tx, ['d1', 'd2']);
    });

    it('an event without ids touches nothing', async () => {
        const chats = { deleteLinksOfDocuments: jest.fn() };
        await new DocumentDeletedHandler(chats as never).onDocumentDeleted(envelope('document.deleted', { userId: 'u1' }), tx);
        expect(chats.deleteLinksOfDocuments).not.toHaveBeenCalled();
    });

    it('is a no-op when the chat is already gone (nothing to delete)', async () => {
        const chats = { deleteLinksOfDocuments: jest.fn().mockResolvedValue(0) };
        await expect(
            new DocumentDeletedHandler(chats as never).onDocumentDeleted(
                envelope('document.deleted', { storageIds: ['gone'], userId: 'u1' }),
                tx
            )
        ).resolves.toBeUndefined();
    });

    it('dead-letters a malformed payload instead of retrying forever', async () => {
        const handler = new DocumentDeletedHandler({ deleteLinksOfDocuments: jest.fn() } as never);
        await expect(handler.onDocumentDeleted(envelope('document.deleted', { storageIds: 'x' }), tx)).rejects.toBeInstanceOf(
            PermanentEventError
        );
    });
});

describe('SubscriptionChangedHandler', () => {
    it('deletes the benefits cache of that user only', async () => {
        const limits = { invalidate: jest.fn().mockResolvedValue(undefined) };
        await new SubscriptionChangedHandler(limits as never).onSubscriptionChanged(
            envelope('finance.subscription.changed', { userId: 'u9', fromTier: 0, toTier: 2, at: 1, version: 2 })
        );
        expect(limits.invalidate).toHaveBeenCalledWith('u9');
    });

    it('dead-letters a payload without a user', async () => {
        const limits = { invalidate: jest.fn() };
        await expect(
            new SubscriptionChangedHandler(limits as never).onSubscriptionChanged(envelope('finance.subscription.changed', {}))
        ).rejects.toBeInstanceOf(PermanentEventError);
        expect(limits.invalidate).not.toHaveBeenCalled();
    });

    it('lets a Redis failure propagate so the consumer retries (a stale cache would outlive the plan)', async () => {
        const limits = { invalidate: jest.fn().mockRejectedValue(new Error('redis down')) };
        await expect(
            new SubscriptionChangedHandler(limits as never).onSubscriptionChanged(
                envelope('finance.subscription.changed', { userId: 'u1' })
            )
        ).rejects.toThrow('redis down');
    });
});
