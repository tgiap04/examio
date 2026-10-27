import { ForbiddenException, HttpException, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { buildMetadata, FinanceClient } from '@examio/grpc';
import { EXPIRED_TIME, RedisService } from '@examio/redis';
import {
    BENEFITS_CACHE_PREFIX,
    BENEFITS_CACHE_SECONDS,
    FREE_TIER_BENEFITS,
} from '../../config/ai-chat.constants';
import { AIChatMessageRepository } from './ai-chat-message.repository';

const benefitsSchema = z.object({
    tier: z.number(),
    tierName: z.string(),
    filesPerMonth: z.number(),
    messagesPerMinute: z.number(),
    chatMessagesLimit: z.number(),
});
export type Benefits = z.infer<typeof benefitsSchema>;

const UNLIMITED = -1;

const benefitsCacheKey = (userId: string): string => `${BENEFITS_CACHE_PREFIX}${userId}`;
/** When the plan of a user last changed (ms): a read that began before it must not cache its answer. */
const invalidatedAtKey = (userId: string): string => `${BENEFITS_CACHE_PREFIX}invalidated-at:${userId}`;

/**
 * Subscription limits of AI chat. The plan's benefits come from finance (`GetUserBenefits`, as the
 * caller) and are cached 5 minutes under `aichat:benefits:<userId>`; the `finance.subscription.changed`
 * consumer deletes the key so a tier change applies at once, and leaves a timestamp so a read that was
 * already waiting on finance does not write the old plan back after the delete. Unknown benefits fail SAFE (Free tier).
 */
@Injectable()
export class AIChatLimitsService {
    private readonly logger = new Logger(AIChatLimitsService.name);

    constructor(
        private readonly messages: AIChatMessageRepository,
        private readonly finance: FinanceClient,
        private readonly redis: RedisService
    ) {}

    /**
     * Throws 429 (too many messages this minute) or 403 (this chat is full) when the user may not send.
     * A regenerate passes `replacesFrom`: the messages it deletes do not count toward the chat limit.
     */
    async assertCanSend(userId: string, chatId: string, userToken: string, replacesFrom?: Date): Promise<void> {
        const benefits = await this.benefits(userId, userToken);

        if (benefits.messagesPerMinute !== UNLIMITED) {
            const sent = await this.messages.countUserMessagesSince(userId, new Date(Date.now() - 60_000));
            if (sent >= benefits.messagesPerMinute) {
                throw new HttpException(
                    {
                        statusCode: 429,
                        code: 'RATE_LIMITED',
                        message: `Giới hạn tốc độ: ${benefits.messagesPerMinute} tin nhắn/phút. Vui lòng chờ giây lát.`,
                    },
                    429
                );
            }
        }
        if (benefits.chatMessagesLimit !== UNLIMITED) {
            const inChat = await this.messages.countUserMessagesInChat(chatId, replacesFrom);
            if (inChat >= benefits.chatMessagesLimit) {
                throw new ForbiddenException({
                    statusCode: 403,
                    code: 'CHAT_LIMIT_REACHED',
                    message: `Giới hạn hội thoại: ${benefits.chatMessagesLimit} tin nhắn. Vui lòng tạo đoạn chat mới.`,
                });
            }
        }
    }

    async benefits(userId: string, userToken: string): Promise<Benefits> {
        const cached = await this.readCache(userId);
        if (cached) return cached;
        const startedAt = Date.now();
        try {
            const fresh = await this.finance.getUserBenefits(
                userId,
                buildMetadata({ authorization: `Bearer ${userToken}` })
            );
            const benefits = benefitsSchema.parse(fresh);
            if (!(await this.invalidatedSince(userId, startedAt))) await this.writeCache(userId, benefits);
            return benefits;
        } catch (error) {
            this.logger.error(`Error getting subscription benefits: ${(error as Error).message}`);
            return { ...FREE_TIER_BENEFITS };
        }
    }

    /** `finance.subscription.changed`: the next message reads the new plan. */
    async invalidate(userId: string): Promise<void> {
        // The marker first: a read finishing between the two calls then sees it and skips its write.
        await this.redis.set(invalidatedAtKey(userId), Date.now(), EXPIRED_TIME.TEN_MINUTES);
        await this.redis.del(benefitsCacheKey(userId));
    }

    /** True when the plan changed at or after `startedAt`. A marker that cannot be read counts as "no" (the TTL bounds the staleness). */
    private async invalidatedSince(userId: string, startedAt: number): Promise<boolean> {
        try {
            const at = Number(await this.redis.get(invalidatedAtKey(userId)));
            return Number.isFinite(at) && at >= startedAt;
        } catch (error) {
            this.logger.warn(`Benefits invalidation marker read failed: ${(error as Error).message}`);
            return false;
        }
    }

    private async readCache(userId: string): Promise<Benefits | null> {
        try {
            const parsed = benefitsSchema.safeParse(await this.redis.get(benefitsCacheKey(userId)));
            return parsed.success ? parsed.data : null;
        } catch (error) {
            this.logger.warn(`Benefits cache read failed, asking finance: ${(error as Error).message}`);
            return null;
        }
    }

    private async writeCache(userId: string, benefits: Benefits): Promise<void> {
        try {
            await this.redis.set(benefitsCacheKey(userId), benefits, BENEFITS_CACHE_SECONDS);
        } catch (error) {
            this.logger.warn(`Benefits cache write failed: ${(error as Error).message}`);
        }
    }
}
