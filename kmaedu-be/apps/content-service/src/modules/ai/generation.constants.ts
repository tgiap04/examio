import { EXPIRED_TIME } from '@kmaedu/redis';

/** `GenerationJob.status`. PROCESSING is accepted wherever QUEUED is (a worker may report progress later). */
export const JobStatus = {
    QUEUED: 'QUEUED',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
} as const;
export type JobStatusValue = (typeof JobStatus)[keyof typeof JobStatus];

/** States an `ai.generation.*` event, the watchdog and a cancel may settle (the job is queued at ai-service). */
export const IN_FLIGHT_STATUSES: readonly JobStatusValue[] = [JobStatus.QUEUED, JobStatus.PROCESSING];
/** States a job can still leave (it holds the generation lock): the same set as IN_FLIGHT_STATUSES. */
export const OPEN_STATUSES: readonly JobStatusValue[] = IN_FLIGHT_STATUSES;

export type GenerationType = 'quiz' | 'flashcard';

/** Files over this are refused before anything is stored (the multer cap is the transport limit). */
export const MAX_GENERATE_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_MULTER_FILE_BYTES = 50 * 1024 * 1024;

/** Per user and type; released on every terminal state, the TTL is only the leak guard. */
export const GENERATION_LOCK_TTL_SECONDS = 30 * 60;
export const generationLockKey = (userId: string, type: GenerationType): string => `content:gen:lock:${userId}:${type}`;

/**
 * A QUEUED / PROCESSING job whose last status change is older than this is failed with
 * `GENERATION_TIMEOUT` (ai-service never answered, or its answer went to a DLQ).
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

export const MODEL_CATALOG_CACHE_KEY = 'content:ai:models';
export const MODEL_CATALOG_CACHE_SECONDS = EXPIRED_TIME.TEN_MINUTES;

/** The generation message FE shows for a failed job (a model problem, today's wording). */
export const MODEL_UNAVAILABLE_MESSAGE = 'Model hiện tại không khả dụng, thử model khác.';
export const GENERATION_FAILED_MESSAGE = 'Không thể tạo nội dung từ file này, vui lòng thử lại.';
export const JOB_CANCELLED_MESSAGE = 'Tác vụ đã bị hủy.';
