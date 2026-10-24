import { EXPIRED_TIME } from '@examio/redis';

/** `GenerationJob.status`. PROCESSING is accepted wherever QUEUED is (a worker may report progress later). */
export const JobStatus = {
    PENDING_CHARGE: 'PENDING_CHARGE',
    QUEUED: 'QUEUED',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
} as const;
export type JobStatusValue = (typeof JobStatus)[keyof typeof JobStatus];

/** States a job can still leave: cancelable, and the only ones a completion / failure event may settle. */
export const OPEN_STATUSES: readonly JobStatusValue[] = [JobStatus.PENDING_CHARGE, JobStatus.QUEUED, JobStatus.PROCESSING];
/** States an `ai.generation.*` event may settle (the charge was committed and the job queued). */
export const IN_FLIGHT_STATUSES: readonly JobStatusValue[] = [JobStatus.QUEUED, JobStatus.PROCESSING];
/** States that owe a refund when the job was charged. */
export const REFUNDABLE_STATUSES: readonly JobStatusValue[] = [JobStatus.FAILED, JobStatus.CANCELLED];

export type GenerationType = 'quiz' | 'flashcard';

/** Credits: the 5 of every generation, 1 per started 2 MB upload, 1 per started 10 items on regenerate. */
export const GENERATE_CREDITS = 5;
export const BYTES_PER_UPLOAD_CREDIT = 2 * 1024 * 1024;
export const ITEMS_PER_REGENERATE_CREDIT = 10;

/** Files over this are refused before anything is stored (the multer cap is the transport limit). */
export const MAX_GENERATE_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_MULTER_FILE_BYTES = 50 * 1024 * 1024;

/** Per user and type; released on every terminal state, the TTL is only the leak guard. */
export const GENERATION_LOCK_TTL_SECONDS = 30 * 60;
export const generationLockKey = (userId: string, type: GenerationType): string => `content:gen:lock:${userId}:${type}`;

/** A job charged but never queued (a crash between the debit and the queueing tx) is cancelled and refunded after this. */
export const PENDING_CHARGE_TIMEOUT_MS = 10 * 60 * 1000;
/** A FAILED / CANCELLED job whose refund is still open is retried after this; covers a debit still in flight at cancel time. */
export const REFUND_SWEEP_GRACE_MS = 2 * 60 * 1000;
/**
 * A QUEUED / PROCESSING job whose last status change is older than this is failed with
 * `GENERATION_TIMEOUT` and refunded (ai-service never answered, or its answer went to a DLQ).
 * `GENERATION_JOB_TIMEOUT_MINUTES`, default 60, never below 10 (a smaller value would fail jobs that are
 * still being worked on: ai-service retries a not-yet-processed document for minutes).
 */
export const DEFAULT_JOB_TIMEOUT_MINUTES = 60;
export const MIN_JOB_TIMEOUT_MINUTES = 10;

export function resolveJobTimeoutMs(
    env: NodeJS.ProcessEnv = process.env,
    logger?: { warn(message: string): void }
): number {
    const raw = env.GENERATION_JOB_TIMEOUT_MINUTES;
    if (raw === undefined || raw.trim() === '') return DEFAULT_JOB_TIMEOUT_MINUTES * 60_000;
    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes <= 0) {
        logger?.warn(`GENERATION_JOB_TIMEOUT_MINUTES="${raw}" is not a positive number; using ${DEFAULT_JOB_TIMEOUT_MINUTES}`);
        return DEFAULT_JOB_TIMEOUT_MINUTES * 60_000;
    }
    if (minutes < MIN_JOB_TIMEOUT_MINUTES) {
        logger?.warn(`GENERATION_JOB_TIMEOUT_MINUTES=${minutes} is below ${MIN_JOB_TIMEOUT_MINUTES}; using ${MIN_JOB_TIMEOUT_MINUTES}`);
        return MIN_JOB_TIMEOUT_MINUTES * 60_000;
    }
    return minutes * 60_000;
}

export const REAPER_INTERVAL_MS = 60 * 1000;
export const REAPER_BATCH = 50;

export const MODEL_CATALOG_CACHE_KEY = 'exam:ai:models';
export const MODEL_CATALOG_CACHE_SECONDS = EXPIRED_TIME.TEN_MINUTES;

/** The generation message FE shows for a failed job (a model problem, today's wording). */
export const MODEL_UNAVAILABLE_MESSAGE = 'Model hiện tại không khả dụng, thử model khác.';
export const GENERATION_FAILED_MESSAGE = 'Không thể tạo nội dung từ file này, vui lòng thử lại.';
export const JOB_CANCELLED_MESSAGE = 'Tác vụ đã bị hủy.';
