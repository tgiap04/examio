import { RedisReadinessCheck } from './readiness.check';
import { RedisService } from './redis.service';

describe('RedisReadinessCheck', () => {
    it('resolves when Redis answers', async () => {
        const redis = { exists: jest.fn().mockResolvedValue(false) };
        const check = new RedisReadinessCheck(redis as unknown as RedisService);

        await expect(check.check()).resolves.toBeUndefined();
        expect(check.name).toBe('redis');
    });

    it('rejects when Redis is unreachable', async () => {
        const redis = { exists: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
        const check = new RedisReadinessCheck(redis as unknown as RedisService);

        await expect(check.check()).rejects.toThrow('ECONNREFUSED');
    });
});
