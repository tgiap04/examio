import { ForbiddenException, HttpException } from '@nestjs/common';
import { AIChatLimitsService } from './ai-chat-limits.service';
import { BENEFITS_CACHE_PREFIX, BENEFITS_CACHE_SECONDS, FREE_TIER_BENEFITS } from '../../config/ai-chat.constants';

const FREE = { ...FREE_TIER_BENEFITS };
const PRO = { tier: 2, tierName: 'Pro', filesPerMonth: -1, messagesPerMinute: 60, chatMessagesLimit: -1 };

describe('AIChatLimitsService', () => {
    let messages: { countUserMessagesSince: jest.Mock; countUserMessagesInChat: jest.Mock };
    let finance: { getUserBenefits: jest.Mock };
    let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
    let service: AIChatLimitsService;

    beforeEach(() => {
        messages = {
            countUserMessagesSince: jest.fn().mockResolvedValue(0),
            countUserMessagesInChat: jest.fn().mockResolvedValue(0),
        };
        finance = { getUserBenefits: jest.fn().mockResolvedValue(FREE) };
        redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined), del: jest.fn().mockResolvedValue(undefined) };
        service = new AIChatLimitsService(messages as never, finance as never, redis as never);
    });

    describe('assertCanSend', () => {
        it('allows a message one below each Free-tier limit (boundary)', async () => {
            messages.countUserMessagesSince.mockResolvedValue(4);
            messages.countUserMessagesInChat.mockResolvedValue(29);
            await expect(service.assertCanSend('u1', 'c1', 'tok')).resolves.toBeUndefined();
        });

        it('answers 429 for the message that reaches messagesPerMinute', async () => {
            messages.countUserMessagesSince.mockResolvedValue(5);
            const error = await service.assertCanSend('u1', 'c1', 'tok').catch((e: unknown) => e);
            expect(error).toBeInstanceOf(HttpException);
            expect((error as HttpException).getStatus()).toBe(429);
            expect((error as HttpException).getResponse()).toMatchObject({ code: 'RATE_LIMITED' });
        });

        it('answers 403 once the chat reaches chatMessagesLimit', async () => {
            messages.countUserMessagesInChat.mockResolvedValue(30);
            await expect(service.assertCanSend('u1', 'c1', 'tok')).rejects.toThrow(ForbiddenException);
            expect(messages.countUserMessagesInChat).toHaveBeenCalledWith('c1');
        });

        it('skips both counts for unlimited (-1) benefits', async () => {
            finance.getUserBenefits.mockResolvedValue({ ...FREE, messagesPerMinute: -1, chatMessagesLimit: -1 });
            messages.countUserMessagesSince.mockResolvedValue(10_000);
            messages.countUserMessagesInChat.mockResolvedValue(10_000);
            await expect(service.assertCanSend('u1', 'c1', 'tok')).resolves.toBeUndefined();
            expect(messages.countUserMessagesSince).not.toHaveBeenCalled();
            expect(messages.countUserMessagesInChat).not.toHaveBeenCalled();
        });
    });

    describe('benefits cache', () => {
        it('asks finance with the caller token on a miss and caches the answer for 5 minutes', async () => {
            finance.getUserBenefits.mockResolvedValue(PRO);
            await expect(service.benefits('u1', 'tok')).resolves.toEqual(PRO);
            expect(finance.getUserBenefits).toHaveBeenCalledTimes(1);
            const [userId, metadata] = finance.getUserBenefits.mock.calls[0];
            expect(userId).toBe('u1');
            expect(metadata.get('authorization')).toEqual(['Bearer tok']);
            expect(redis.set).toHaveBeenCalledWith(`${BENEFITS_CACHE_PREFIX}u1`, PRO, BENEFITS_CACHE_SECONDS);
            expect(BENEFITS_CACHE_SECONDS).toBe(300);
        });

        it('serves a cache hit without calling finance', async () => {
            redis.get.mockResolvedValue(PRO);
            await expect(service.benefits('u1', 'tok')).resolves.toEqual(PRO);
            expect(redis.get).toHaveBeenCalledWith('aichat:benefits:u1');
            expect(finance.getUserBenefits).not.toHaveBeenCalled();
        });

        it('ignores a malformed cache entry and refetches', async () => {
            redis.get.mockResolvedValue({ tier: 'x' });
            finance.getUserBenefits.mockResolvedValue(PRO);
            await expect(service.benefits('u1', 'tok')).resolves.toEqual(PRO);
            expect(finance.getUserBenefits).toHaveBeenCalledTimes(1);
        });

        it('falls back to the Free tier, uncached, when finance fails', async () => {
            finance.getUserBenefits.mockRejectedValue(new Error('finance unavailable'));
            messages.countUserMessagesSince.mockResolvedValue(5);
            await expect(service.assertCanSend('u1', 'c1', 'tok')).rejects.toMatchObject({ status: 429 });
            expect(redis.set).not.toHaveBeenCalled();
        });

        it('still answers when Redis is down (reads and writes degrade to finance)', async () => {
            redis.get.mockRejectedValue(new Error('redis down'));
            redis.set.mockRejectedValue(new Error('redis down'));
            finance.getUserBenefits.mockResolvedValue(PRO);
            await expect(service.benefits('u1', 'tok')).resolves.toEqual(PRO);
        });

        it('invalidate deletes the key of that user only', async () => {
            await service.invalidate('u7');
            expect(redis.del).toHaveBeenCalledWith('aichat:benefits:u7');
            expect(redis.del).toHaveBeenCalledTimes(1);
        });
    });
});
