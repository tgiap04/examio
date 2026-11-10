/** Document-service tunables (code constants, not env). */

/** `UserStorage.processingStatus` values. */
export const DocumentStatus = {
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

/** Validity of the `downloadUrl` handed to ai-service. */
export const DOWNLOAD_URL_TTL_SECONDS = 3600;

/** A PENDING row whose `document.uploaded` is older than this may be re-emitted by EnsureProcessed. */
export const REQUEUE_AFTER_MS = 15 * 60 * 1000;

/** ListDocuments paging (the old `recent-uploads` defaults: page 1, size 10, size at most 100). */
export const DEFAULT_LIST_SIZE = 10;
export const MAX_LIST_SIZE = 100;

export const MAX_DELETE_IDS = 1000;
export const MAX_QUERY_IDS = 1000;
