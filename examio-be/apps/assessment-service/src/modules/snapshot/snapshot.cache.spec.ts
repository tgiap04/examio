import { buildSnapshot } from './snapshot.fixture';
import { SnapshotCache } from './snapshot.cache';

describe('SnapshotCache', () => {
    it('keys by session and hash: a new hash is a miss for the same session', () => {
        const cache = new SnapshotCache();
        cache.set(SnapshotCache.key('s1', 'h1'), buildSnapshot());
        expect(cache.get(SnapshotCache.key('s1', 'h1'))).toBeDefined();
        expect(cache.get(SnapshotCache.key('s1', 'h2'))).toBeUndefined();
    });

    it('holds at most max entries and evicts the least recently used', () => {
        const cache = new SnapshotCache(3);
        for (const k of ['a', 'b', 'c']) cache.set(k, buildSnapshot());
        cache.get('a'); // a is now the most recent; b is the oldest
        cache.set('d', buildSnapshot());
        expect(cache.size).toBe(3);
        expect(cache.get('b')).toBeUndefined();
        expect(cache.get('a')).toBeDefined();
    });

    it('drops an entry after the TTL', () => {
        let now = 1_000;
        const cache = new SnapshotCache(50, 5 * 60_000, () => now);
        cache.set('k', buildSnapshot());
        now += 5 * 60_000 - 1;
        expect(cache.get('k')).toBeDefined();
        now += 2;
        expect(cache.get('k')).toBeUndefined();
        expect(cache.size).toBe(0);
    });
});
