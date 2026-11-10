import { NotFoundException } from '@nestjs/common';
import { AIChatTurnService } from './ai-chat-turn.service';

const USER = { id: 'u1' } as never;
const chat = { id: 'c1', userId: 'u1', title: 't', subjectId: null };

function build() {
    const access = { ownedChat: jest.fn().mockResolvedValue(chat) };
    const documents = { assertOwned: jest.fn().mockResolvedValue(undefined) };
    const turn = new AIChatTurnService(access as never, documents as never, {} as never, {} as never);
    return { turn, access, documents };
}

describe('AIChatTurnService.admit', () => {
    it('applies no per-minute or per-chat message limit (a 6th message in a minute and a 31st in a chat are admitted)', async () => {
        const h = build();
        const input = { message: 'hi', documentId: 'd1', documentIds: ['d1', 'd2'] };

        // Back to back, far more than the old Free plan's 5 per minute / 30 per chat: every one is admitted.
        for (let i = 0; i < 31; i += 1) {
            await expect(h.turn.admit('c1', USER, input, 'tok')).resolves.toEqual({ chat, requestedIds: ['d1', 'd2'] });
        }
        expect(h.access.ownedChat).toHaveBeenCalledTimes(31);
    });

    it('still refuses a chat that is not the caller (ownership stays)', async () => {
        const h = build();
        h.access.ownedChat.mockRejectedValue(new NotFoundException());
        await expect(h.turn.admit('c1', USER, { message: 'hi' }, 'tok')).rejects.toBeInstanceOf(NotFoundException);
        expect(h.documents.assertOwned).not.toHaveBeenCalled();
    });

    it('still refuses a document the caller does not own, with the deduplicated ids', async () => {
        const h = build();
        h.documents.assertOwned.mockRejectedValue(new NotFoundException());
        await expect(h.turn.admit('c1', USER, { message: 'hi', documentId: 'd1', documentIds: ['d1'] }, 'tok')).rejects.toBeInstanceOf(NotFoundException);
        expect(h.documents.assertOwned).toHaveBeenCalledWith(['d1'], 'tok');
    });
});
