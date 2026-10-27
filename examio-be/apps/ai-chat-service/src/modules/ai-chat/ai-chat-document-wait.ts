import { documentV1 } from '@examio/contracts';

const Status = documentV1.DocumentProcessingStatus;

/** How long a chat message waits for its documents' OCR (HEAD waited synchronously up to 5 minutes). */
export const DEFAULT_DOCUMENT_WAIT_MS = 120_000;
/** First poll interval; it grows by `POLL_BACKOFF` up to `POLL_MAX_MS`. */
export const POLL_START_MS = 2_000;
export const POLL_BACKOFF = 1.5;
export const POLL_MAX_MS = 8_000;

/** `AI_CHAT_DOCUMENT_WAIT_MS`: a non-negative number of milliseconds (0 = do not wait), default 2 minutes. */
export function resolveDocumentWaitMs(
    env: NodeJS.ProcessEnv = process.env,
    logger?: { warn(message: string): void }
): number {
    const raw = env.AI_CHAT_DOCUMENT_WAIT_MS;
    if (raw === undefined || raw.trim() === '') return DEFAULT_DOCUMENT_WAIT_MS;
    const ms = Number(raw);
    if (!Number.isFinite(ms) || ms < 0) {
        logger?.warn(`AI_CHAT_DOCUMENT_WAIT_MS="${raw}" is not a non-negative number; using ${DEFAULT_DOCUMENT_WAIT_MS}`);
        return DEFAULT_DOCUMENT_WAIT_MS;
    }
    return ms;
}

export interface DocumentWaitDeps {
    /** Caller-owned rows of the ids (`GetDocumentsByIds`); a missing or foreign id is simply absent. */
    fetchDocuments(ids: string[]): Promise<documentV1.DocumentInfo[]>;
    sleep(ms: number): Promise<void>;
    now(): number;
    onPollError?(error: unknown): void;
    /** The client left: polling stops (`sleep` is expected to return early too). */
    signal?: AbortSignal;
}

/** COMPLETED and FAILED are final for a chat message: there is nothing more to wait for. */
const isSettled = (doc: documentV1.DocumentInfo): boolean =>
    doc.processingStatus === Status.DOCUMENT_PROCESSING_STATUS_COMPLETED ||
    doc.processingStatus === Status.DOCUMENT_PROCESSING_STATUS_FAILED;

/**
 * Polls until every id is COMPLETED or FAILED (an id that vanished counts as done), for at most `waitMs`.
 * Returns the ids still unsettled when the budget ran out (empty = everything settled). A poll that
 * fails is retried until the budget is spent; the wait never throws and never exceeds `waitMs`.
 * An aborted `deps.signal` ends it at once with the ids still pending.
 */
export async function waitForDocuments(ids: string[], waitMs: number, deps: DocumentWaitDeps): Promise<string[]> {
    const deadline = deps.now() + waitMs;
    let pending = [...new Set(ids)];
    let interval = POLL_START_MS;
    for (;;) {
        if (deps.signal?.aborted) return pending;
        try {
            const docs = await deps.fetchDocuments(pending);
            const unsettled = new Set(docs.filter((doc) => !isSettled(doc)).map((doc) => doc.id));
            pending = pending.filter((id) => unsettled.has(id));
        } catch (error) {
            deps.onPollError?.(error);
        }
        if (pending.length === 0) return [];
        if (deps.signal?.aborted) return pending;
        const left = deadline - deps.now();
        if (left <= 0) return pending;
        await deps.sleep(Math.min(interval, left));
        interval = Math.min(interval * POLL_BACKOFF, POLL_MAX_MS);
    }
}
