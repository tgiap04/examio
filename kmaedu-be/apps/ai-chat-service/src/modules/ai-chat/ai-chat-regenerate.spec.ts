import { HttpException, NotFoundException } from '@nestjs/common';
import { AIChatAnswerService } from './ai-chat-answer.service';
import { AIChatStreamService } from './ai-chat-stream.service';
import { AIChatTurnService } from './ai-chat-turn.service';

const USER = { id: 'u1' } as never;
const chat = { id: 'c1', userId: 'u1', title: 't', subjectId: 's1' };
const message = {
    id: 'm2',
    chatId: 'c1',
    role: 'user',
    content: 'again',
    imageUrl: null,
    documentId: null,
    documentName: null,
    createdAt: new Date('2026-01-01T10:00:00Z'),
};

type Rejects = 'chat' | 'documents';
const rejections: Array<[string, Rejects, () => Error]> = [
    ['404 chat', 'chat', () => new NotFoundException({ code: 'CHAT_NOT_FOUND' })],
    ['404 document', 'documents', () => new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' })],
];

function build() {
    const documents = {
        assertOwned: jest.fn().mockResolvedValue(undefined),
        effectiveIds: jest.fn().mockResolvedValue(['d1']),
        ensureReady: jest.fn().mockResolvedValue(undefined),
    };
    const repo = { findSubjectPrompt: jest.fn().mockResolvedValue('be a teacher'), updateTitle: jest.fn() };
    const messages = {
        findRecent: jest.fn().mockResolvedValue([]),
        create: jest.fn(async (data: { id: string }) => ({ ...data })),
    };
    const access = {
        ownedMessage: jest.fn().mockResolvedValue({ message, chat }),
        ownedChat: jest.fn().mockResolvedValue(chat),
    };
    const order: string[] = [];
    const deletion = { deleteFrom: jest.fn(async () => void order.push('delete')) };
    const ai = {
        query: jest.fn(async () => {
            order.push('ai');
            return { answer: 'fresh answer' };
        }),
        streamChat: jest.fn(),
    };
    messages.create.mockImplementation(async (data: { id: string; role: string }) => {
        order.push(`save:${data.role}`);
        return { ...data };
    });
    const turn = new AIChatTurnService(access as never, documents as never, repo as never, messages as never);
    const answer = new AIChatAnswerService(turn, documents as never, access as never, deletion as never, ai as never);
    const stream = new AIChatStreamService(turn, documents as never, access as never, deletion as never, ai as never);
    return { access, documents, repo, messages, deletion, ai, answer, stream, order };
}

function fakeSse(aborted = false) {
    const controller = new AbortController();
    if (aborted) controller.abort();
    let committed = false;
    return {
        signal: controller.signal,
        get committed() {
            return committed;
        },
        commit: jest.fn(() => void (committed = true)),
        send: jest.fn(),
        fail: jest.fn(),
        end: jest.fn(),
    };
}

/** A stream that opens at once and ends with a `done` frame. */
function doneStream(order: string[]) {
    const { of } = jest.requireActual('rxjs') as typeof import('rxjs');
    order.push('ai');
    return { frames: of({ chunk: 'fresh' }, { done: { assistantMessage: { content: 'fresh' } } }), cancel: jest.fn() };
}

describe('regenerate keeps the message until the regenerate is accepted', () => {
    describe.each(rejections)('rejected with %s', (_name, target, make) => {
        it('answer: nothing is deleted or saved', async () => {
            const h = build();
            (target === 'chat' ? h.access.ownedChat : h.documents.assertOwned).mockRejectedValue(make());
            await expect(h.answer.regenerateFromMessage('m2', USER, 'tok')).rejects.toBeInstanceOf(Error);
            expect(h.deletion.deleteFrom).not.toHaveBeenCalled();
            expect(h.messages.create).not.toHaveBeenCalled();
            expect(h.ai.query).not.toHaveBeenCalled();
        });

        it('stream: nothing is deleted, saved or sent to ai-service', async () => {
            const h = build();
            (target === 'chat' ? h.access.ownedChat : h.documents.assertOwned).mockRejectedValue(make());
            await expect(h.stream.regenerateStream('m2', USER, 'tok', fakeSse() as never)).rejects.toBeInstanceOf(Error);
            expect(h.deletion.deleteFrom).not.toHaveBeenCalled();
            expect(h.messages.create).not.toHaveBeenCalled();
            expect(h.ai.streamChat).not.toHaveBeenCalled();
        });
    });

    it('answer: an AI failure that is surfaced to the caller deletes nothing', async () => {
        const h = build();
        h.ai.query.mockRejectedValue(Object.assign(new Error('resource exhausted'), { code: 8 }));
        await expect(h.answer.regenerateFromMessage('m2', USER, 'tok')).rejects.toBeInstanceOf(HttpException);
        expect(h.deletion.deleteFrom).not.toHaveBeenCalled();
    });

    it('stream: ai-service refusing to open the stream deletes nothing', async () => {
        const h = build();
        h.ai.streamChat.mockRejectedValue(Object.assign(new Error('resource exhausted'), { code: 8 }));
        await expect(h.stream.regenerateStream('m2', USER, 'tok', fakeSse() as never)).rejects.toBeInstanceOf(HttpException);
        expect(h.deletion.deleteFrom).not.toHaveBeenCalled();
    });

    it('stream: a client that left before the answer began deletes nothing', async () => {
        const h = build();
        await h.stream.regenerateStream('m2', USER, 'tok', fakeSse(true) as never);
        expect(h.deletion.deleteFrom).not.toHaveBeenCalled();
    });

    it('answer: on success the old messages are replaced after the answer is in hand and before the new ones are saved', async () => {
        const h = build();
        await h.answer.regenerateFromMessage('m2', USER, 'tok');
        expect(h.deletion.deleteFrom).toHaveBeenCalledTimes(1);
        expect(h.deletion.deleteFrom).toHaveBeenCalledWith(chat, message);
        expect(h.order).toEqual(['ai', 'delete', 'save:user', 'save:assistant']);
        // the model context is the history BEFORE the regenerated message
        expect(h.messages.findRecent).toHaveBeenCalledWith('c1', expect.any(Number), message.createdAt);
    });

    it('stream: on success the old messages are replaced once the stream is open and before the new ones are saved', async () => {
        const h = build();
        h.ai.streamChat.mockImplementation(async () => doneStream(h.order));
        const sse = fakeSse();
        await h.stream.regenerateStream('m2', USER, 'tok', sse as never);
        expect(h.deletion.deleteFrom).toHaveBeenCalledWith(chat, message);
        expect(h.order).toEqual(['ai', 'delete', 'save:user', 'save:assistant']);
        expect(h.messages.findRecent).toHaveBeenCalledWith('c1', expect.any(Number), message.createdAt);
        expect(sse.fail).not.toHaveBeenCalled();
    });
});

describe('the plain and the streaming call build the same ai-service request', () => {
    it('both carry systemPrompt and modelType', async () => {
        const h = build();
        const input = { message: 'hello', modelType: 'gemini-x' };
        await h.answer.sendMessage('c1', USER, input, 'tok');
        h.ai.streamChat.mockImplementation(async () => doneStream(h.order));
        await h.stream.streamMessage('c1', USER, input, 'tok', fakeSse() as never);

        const queried = h.ai.query.mock.calls[0] as unknown as [Record<string, unknown>];
        const streamed = h.ai.streamChat.mock.calls[0] as unknown as [Record<string, unknown>];
        expect(queried[0]).toMatchObject({ query: 'hello', modelType: 'gemini-x', systemPrompt: 'be a teacher', userStorageId: 'd1' });
        expect(queried[0]).toEqual(streamed[0]);
    });
});

describe('the OCR wait follows the client', () => {
    it('stream: the abort signal of the response reaches ensureReady', async () => {
        const h = build();
        h.ai.streamChat.mockImplementation(async () => doneStream(h.order));
        const sse = fakeSse();
        await h.stream.streamMessage('c1', USER, { message: 'hello' }, 'tok', sse as never);
        expect(h.documents.ensureReady).toHaveBeenCalledWith(['d1'], 'tok', expect.any(Function), sse.signal);
    });
});
