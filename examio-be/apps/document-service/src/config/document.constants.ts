/** Document-service tunables (code constants, not env: they are part of the money contract). */

/** `UserStorage.processingStatus` values. PENDING_CHARGE exists only between insert and debit. */
export const DocumentStatus = {
    PENDING_CHARGE: 'PENDING_CHARGE',
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
} as const;
export type DocumentStatusValue = (typeof DocumentStatus)[keyof typeof DocumentStatus];

/** R2 areas of server-issued uploads; every key is `<area>/<ownerUserId>/<random>-<name>`. */
export const AI_UPLOAD_AREAS = ['ai-uploads', 'ai-teacher'] as const;

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_QUICK_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** One credit per started 2 MB, as before the extraction. */
export const BYTES_PER_CREDIT = 2 * 1024 * 1024;

/** Validity of the `downloadUrl` handed to ai-service. */
export const DOWNLOAD_URL_TTL_SECONDS = 3600;

/** A PENDING_CHARGE row older than this is settled by the reaper (refund attempt, then FAILED). */
export const PENDING_CHARGE_TIMEOUT_MS = 10 * 60 * 1000;
/**
 * A charge-failed row whose refund is still open is retried after this; a Refund NOT_FOUND ("never
 * charged") settles only past it, because a Debit whose answer was lost may still commit.
 */
export const REFUND_SWEEP_GRACE_MS = 2 * 60 * 1000;
export const REAPER_INTERVAL_MS = 60 * 1000;
export const REAPER_BATCH = 50;

/** A PENDING row whose `document.uploaded` is older than this may be re-emitted by EnsureProcessed. */
export const REQUEUE_AFTER_MS = 15 * 60 * 1000;

/** Fail-safe monthly quota when finance cannot be reached (Free tier). */
export const FREE_TIER_FILES_PER_MONTH = 5;

/** ListDocuments paging (the old `recent-uploads` defaults: page 1, size 10, size at most 100). */
export const DEFAULT_LIST_SIZE = 10;
export const MAX_LIST_SIZE = 100;

export const MAX_DELETE_IDS = 1000;
export const MAX_QUERY_IDS = 1000;

export const uploadCredits = (sizeBytes: number): number => Math.ceil(sizeBytes / BYTES_PER_CREDIT);
export const docChargeKey = (storageId: string): string => `doc:${storageId}`;
