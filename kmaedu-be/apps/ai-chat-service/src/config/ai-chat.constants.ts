/**
 * Only the last 4 messages go to the model, so a small buffer beyond that is fetched instead of the
 * whole (unbounded) history.
 */
export const HISTORY_FETCH_LIMIT = 6;
export const HISTORY_KEEP = 4;
export const HISTORY_CONTENT_MAX_CHARS = 1200;

/** ai-service limit on `query` (see ai.proto): longer input is refused up front with a 400. */
export const MESSAGE_MAX_CHARS = 8000;

/** `Query` runs a model call; ai-service documents 60 s as the ceiling. Never retried. */
export const QUERY_DEADLINE_MS = 60_000;
/** `StreamChat` has no deadline: a stream that stays silent this long is cancelled instead. */
export const STREAM_IDLE_TIMEOUT_MS = 60_000;
/** An SSE comment every 15 s keeps proxies (and the browser) from closing a quiet stream. */
export const SSE_HEARTBEAT_MS = 15_000;

/** R2 areas a chat image may legitimately live in: `/r2/image` uploads go to `images/<userId>/`. */
export const MESSAGE_IMAGE_AREAS = ['images'] as const;
