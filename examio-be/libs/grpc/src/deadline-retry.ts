import { status } from '@grpc/grpc-js';
import { lastValueFrom, Observable } from 'rxjs';
import { isIdempotentRpc } from './idempotent-rpcs';

export const DEFAULT_DEADLINE_MS = 3000;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 100;

export interface InvokeOptions {
    /** Per-call deadline; default 3s (AI calls pass 60s). */
    deadlineMs?: number;
    /** Injectable for tests. */
    sleep?: (ms: number) => Promise<void>;
}

/** grpc-js call options handed to the generated client as the trailing arg. */
export interface CallOptions {
    deadline: number;
}

const defaultSleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

function isUnavailable(err: unknown): boolean {
    return (err as { code?: number } | null)?.code === status.UNAVAILABLE;
}

/**
 * Runs one unary RPC with a fresh deadline per attempt. Retries UNAVAILABLE
 * (max 2, exponential backoff) only for RPCs in IDEMPOTENT_RPCS; every other
 * RPC and every other status fails on the first attempt.
 *
 * `rpc` is `"<pkg>.<Service>/<Method>"`. Metadata is bound by the caller inside
 * `invoke`, so it is always explicit at the call site.
 */
export async function invokeRpc<T>(
    rpc: string,
    invoke: (options: CallOptions) => Observable<T>,
    options: InvokeOptions = {}
): Promise<T> {
    const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
    const sleep = options.sleep ?? defaultSleep;
    const retries = isIdempotentRpc(rpc) ? MAX_RETRIES : 0;

    for (let attempt = 0; ; attempt++) {
        try {
            return await lastValueFrom(
                invoke({ deadline: Date.now() + deadlineMs })
            );
        } catch (err) {
            if (attempt >= retries || !isUnavailable(err)) throw err;
            await sleep(BASE_DELAY_MS * 2 ** attempt);
        }
    }
}
