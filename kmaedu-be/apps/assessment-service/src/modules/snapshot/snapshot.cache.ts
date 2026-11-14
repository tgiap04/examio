import type { QuizSnapshotV1 } from './quiz-snapshot';

export const SNAPSHOT_CACHE_MAX_ENTRIES = 50;
export const SNAPSHOT_CACHE_TTL_MS = 5 * 60 * 1000;

interface Entry {
    snapshot: QuizSnapshotV1;
    expiresAt: number;
}

/**
 * In-process LRU of parsed, validated snapshots. The key is `<sessionId>:<quizSnapshotHash>`, so a
 * refresh (new hash) is a different key and the old entry just ages out. Every replica owns its
 * cache: nothing to invalidate across processes. Memory is bounded by the entry count (a snapshot
 * is at most 1 MB serialized).
 */
export class SnapshotCache {
    private readonly entries = new Map<string, Entry>();

    constructor(
        private readonly maxEntries = SNAPSHOT_CACHE_MAX_ENTRIES,
        private readonly ttlMs = SNAPSHOT_CACHE_TTL_MS,
        private readonly now: () => number = Date.now
    ) {}

    static key(sessionId: string, hash: string): string {
        return `${sessionId}:${hash}`;
    }

    get(key: string): QuizSnapshotV1 | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= this.now()) {
            this.entries.delete(key);
            return undefined;
        }
        // Re-insert: Map keeps insertion order, so the first key is always the least recently used.
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry.snapshot;
    }

    set(key: string, snapshot: QuizSnapshotV1): void {
        this.entries.delete(key);
        this.entries.set(key, { snapshot, expiresAt: this.now() + this.ttlMs });
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next().value as string;
            this.entries.delete(oldest);
        }
    }

    get size(): number {
        return this.entries.size;
    }
}
