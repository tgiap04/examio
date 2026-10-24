import { documentV1 } from '@examio/contracts';
import { AIChatService } from './ai-chat.service';
import {
    DEFAULT_DOCUMENT_WAIT_MS,
    POLL_MAX_MS,
    POLL_START_MS,
    resolveDocumentWaitMs,
    waitForDocuments,
} from './ai-chat-document-wait';

const S = documentV1.DocumentProcessingStatus;
const doc = (id: string, processingStatus: documentV1.DocumentProcessingStatus): documentV1.DocumentInfo => ({
    id,
    userId: 'u1',
    filename: `${id}.pdf`,
    mimetype: 'application/pdf',
    size: '1',
    keyR2: `k/${id}`,
    url: '',
    processingStatus,
    creditCharged: false,
    pageCount: 0,
    createdAt: '0',
    updatedAt: '0',
});

describe('resolveDocumentWaitMs', () => {
    it('defaults to 2 minutes, honours a valid value (0 = no wait) and falls back with a warning on garbage', () => {
        const warn = jest.fn();
        expect(resolveDocumentWaitMs({})).toBe(DEFAULT_DOCUMENT_WAIT_MS);
        expect(resolveDocumentWaitMs({ AI_CHAT_DOCUMENT_WAIT_MS: ' ' })).toBe(DEFAULT_DOCUMENT_WAIT_MS);
        expect(resolveDocumentWaitMs({ AI_CHAT_DOCUMENT_WAIT_MS: '30000' })).toBe(30_000);
        expect(resolveDocumentWaitMs({ AI_CHAT_DOCUMENT_WAIT_MS: '0' })).toBe(0);
        expect(warn).not.toHaveBeenCalled();
        expect(resolveDocumentWaitMs({ AI_CHAT_DOCUMENT_WAIT_MS: 'soon' }, { warn })).toBe(DEFAULT_DOCUMENT_WAIT_MS);
        expect(resolveDocumentWaitMs({ AI_CHAT_DOCUMENT_WAIT_MS: '-5' }, { warn })).toBe(DEFAULT_DOCUMENT_WAIT_MS);
        expect(warn).toHaveBeenCalledTimes(2);
    });
});

describe('waitForDocuments', () => {
    function harness(script: Array<Record<string, documentV1.DocumentProcessingStatus>>) {
        let clock = 0;
        const sleeps: number[] = [];
        let polls = 0;
        return {
            sleeps,
            polls: () => polls,
            deps: {
                fetchDocuments: jest.fn(async (ids: string[]) => {
                    const step = script[Math.min(polls++, script.length - 1)];
                    return ids.filter((id) => id in step).map((id) => doc(id, step[id]));
                }),
                sleep: async (ms: number) => {
                    sleeps.push(ms);
                    clock += ms;
                },
                now: () => clock,
            },
        };
    }

    it('returns at once when every document is settled (COMPLETED or FAILED)', async () => {
        const h = harness([{ a: S.DOCUMENT_PROCESSING_STATUS_COMPLETED, b: S.DOCUMENT_PROCESSING_STATUS_FAILED }]);
        await expect(waitForDocuments(['a', 'b'], 120_000, h.deps)).resolves.toEqual([]);
        expect(h.polls()).toBe(1);
        expect(h.sleeps).toEqual([]);
    });

    it('PENDING -> PROCESSING -> COMPLETED on the 3rd poll: waits 2 s then 3 s and reports nothing unsettled', async () => {
        const h = harness([
            { a: S.DOCUMENT_PROCESSING_STATUS_PENDING },
            { a: S.DOCUMENT_PROCESSING_STATUS_PROCESSING },
            { a: S.DOCUMENT_PROCESSING_STATUS_COMPLETED },
        ]);
        await expect(waitForDocuments(['a'], 120_000, h.deps)).resolves.toEqual([]);
        expect(h.polls()).toBe(3);
        expect(h.sleeps).toEqual([POLL_START_MS, POLL_START_MS * 1.5]);
    });

    it('stops polling the settled ones and keeps polling the rest; a vanished id counts as done', async () => {
        const h = harness([
            { a: S.DOCUMENT_PROCESSING_STATUS_COMPLETED, b: S.DOCUMENT_PROCESSING_STATUS_PROCESSING, c: S.DOCUMENT_PROCESSING_STATUS_PROCESSING },
            { b: S.DOCUMENT_PROCESSING_STATUS_COMPLETED },
        ]);
        await expect(waitForDocuments(['a', 'b', 'c'], 120_000, h.deps)).resolves.toEqual([]);
        expect(h.deps.fetchDocuments.mock.calls.map(([ids]) => ids)).toEqual([['a', 'b', 'c'], ['b', 'c']]);
    });

    it('gives up at the budget with the still-pending ids, never sleeping past it and backing off to the cap', async () => {
        const h = harness([{ a: S.DOCUMENT_PROCESSING_STATUS_PROCESSING }]);
        await expect(waitForDocuments(['a'], 30_000, h.deps)).resolves.toEqual(['a']);
        expect(h.sleeps.reduce((sum, ms) => sum + ms, 0)).toBe(30_000);
        expect(Math.max(...h.sleeps)).toBeLessThanOrEqual(POLL_MAX_MS);
        expect(h.sleeps[0]).toBe(POLL_START_MS);
    });

    it('a zero budget polls once and does not sleep', async () => {
        const h = harness([{ a: S.DOCUMENT_PROCESSING_STATUS_PENDING }]);
        await expect(waitForDocuments(['a'], 0, h.deps)).resolves.toEqual(['a']);
        expect(h.polls()).toBe(1);
        expect(h.sleeps).toEqual([]);
    });

    it('a failing poll is reported and retried inside the budget, then the wait ends without throwing', async () => {
        const h = harness([{ a: S.DOCUMENT_PROCESSING_STATUS_PENDING }]);
        const onPollError = jest.fn();
        let calls = 0;
        h.deps.fetchDocuments.mockImplementation(async (ids: string[]) => {
            calls += 1;
            if (calls === 1) throw new Error('document-service down');
            return ids.map((id) => doc(id, S.DOCUMENT_PROCESSING_STATUS_COMPLETED));
        });
        await expect(waitForDocuments(['a'], 60_000, { ...h.deps, onPollError })).resolves.toEqual([]);
        expect(onPollError).toHaveBeenCalledTimes(1);
    });
});

describe('AIChatService.checkAndProcessDocuments (OCR wait)', () => {
    type Checker = { checkAndProcessDocuments(ids: string[], token?: string): Promise<void> };
    const token = [
        'h',
        Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url'),
        's',
    ].join('.');

    afterEach(() => {
        jest.useRealTimers();
        delete process.env.AI_CHAT_DOCUMENT_WAIT_MS;
    });

    function build(statuses: documentV1.DocumentProcessingStatus[]) {
        let call = 0;
        const documents = {
            getDocumentsByIds: jest.fn(async (ids: string[]) => {
                const status = statuses[Math.min(call++, statuses.length - 1)];
                return ids.map((id) => doc(id, status));
            }),
            ensureProcessed: jest.fn(async () => undefined),
        };
        const service = new AIChatService({} as never, {} as never, {} as never, {} as never, documents as never);
        return { documents, checker: service as unknown as Checker };
    }

    it('re-queues a PENDING document, polls until it is COMPLETED on the 3rd poll and then lets the chat proceed with its context', async () => {
        jest.useFakeTimers();
        const { documents, checker } = build([
            S.DOCUMENT_PROCESSING_STATUS_PENDING, // the initial read
            S.DOCUMENT_PROCESSING_STATUS_PENDING, // poll 1
            S.DOCUMENT_PROCESSING_STATUS_PROCESSING, // poll 2
            S.DOCUMENT_PROCESSING_STATUS_COMPLETED, // poll 3
        ]);
        let done = false;
        const run = checker.checkAndProcessDocuments(['d1'], token).then(() => {
            done = true;
        });

        await jest.advanceTimersByTimeAsync(1_000);
        expect(done).toBe(false);
        await jest.advanceTimersByTimeAsync(10_000);
        await run;

        expect(documents.ensureProcessed).toHaveBeenCalledTimes(1);
        expect(documents.getDocumentsByIds).toHaveBeenCalledTimes(4);
        expect(done).toBe(true);
    });

    it('a COMPLETED document is never polled and nothing is re-queued', async () => {
        const { documents, checker } = build([S.DOCUMENT_PROCESSING_STATUS_COMPLETED]);
        await checker.checkAndProcessDocuments(['d1'], token);
        expect(documents.getDocumentsByIds).toHaveBeenCalledTimes(1);
        expect(documents.ensureProcessed).not.toHaveBeenCalled();
    });

    it('on timeout the message proceeds without that document: the wait ends at AI_CHAT_DOCUMENT_WAIT_MS and does not throw', async () => {
        jest.useFakeTimers();
        process.env.AI_CHAT_DOCUMENT_WAIT_MS = '5000';
        const { documents, checker } = build([S.DOCUMENT_PROCESSING_STATUS_PROCESSING]);
        const run = checker.checkAndProcessDocuments(['d1'], token);

        await jest.advanceTimersByTimeAsync(5_000);
        await expect(run).resolves.toBeUndefined();

        expect(documents.ensureProcessed).not.toHaveBeenCalled(); // PROCESSING is already being worked on
        expect(documents.getDocumentsByIds.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
});
