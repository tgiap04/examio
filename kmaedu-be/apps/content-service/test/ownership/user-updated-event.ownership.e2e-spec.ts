import { RedisService } from '@kmaedu/redis';
import { bootContentApp, rid, type ContentTestApp } from './support/content-test-app';
import { connectPublisher, eventually } from './support/broker';

/** `auth.user.updated` on `content.events` drops the cached public profile (prefix `content:cache:user:`). */
describe('auth.user.updated on content.events (e2e)', () => {
    let t: ContentTestApp;

    beforeAll(async () => {
        t = await bootContentApp();
    });
    afterAll(() => t?.close());

    it('deletes the cached profile of that user only', async () => {
        const redis = t.app.get(RedisService);
        const changed = `u_${rid()}`;
        const untouched = `u_${rid()}`;
        await redis.set(`content:cache:user:${changed}`, { id: changed }, 300);
        await redis.set(`content:cache:user:${untouched}`, { id: untouched }, 300);

        const auth = await connectPublisher(process.env.RABBITMQ_AUTH_URL as string);
        try {
            await auth.publish('auth.user.updated', { userId: changed, version: 1 });
            await eventually(async () => (await redis.get(`content:cache:user:${changed}`)) === null);
            expect(await redis.get(`content:cache:user:${untouched}`)).not.toBeNull();
        } finally {
            await auth.close();
        }
    });

    it('a malformed payload is dropped without touching the cache (no auth.user.deleted handler exists)', async () => {
        const redis = t.app.get(RedisService);
        const id = `u_${rid()}`;
        await redis.set(`content:cache:user:${id}`, { id }, 300);
        const auth = await connectPublisher(process.env.RABBITMQ_AUTH_URL as string);
        try {
            await auth.publish('auth.user.updated', { notUserId: id, version: 1 });
            await new Promise((resolve) => setTimeout(resolve, 1500));
            expect(await redis.get(`content:cache:user:${id}`)).not.toBeNull();
        } finally {
            await auth.close();
        }
    });
});
