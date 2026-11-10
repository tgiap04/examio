import { Injectable, Logger } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { EXPIRED_TIME, RedisService } from '@examio/redis';
import { ContentClient } from '../../clients/content.client';

/** Cached title and question count of a quiz set, as the teacher's room views show them (5 minutes). */
export const quizSetTitleKey = (quizSetId: string): string => `assessment:cache:quizset:${quizSetId}`;

/** `GetQuizSetsByIds` takes at most this many ids per call. */
const MAX_IDS_PER_CALL = 50;

export interface QuizSetBrief {
    id: string;
    title: string;
    description: null;
    thumbnail: null;
    /** Teacher views only (asked of content); student views never carry it. */
    questionCount?: number;
}

export interface QuizSetSummaryBrief {
    title: string;
    questionCount?: number;
}

const isSummary = (value: unknown): value is Required<QuizSetSummaryBrief> =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as QuizSetSummaryBrief).title === 'string' &&
    typeof (value as QuizSetSummaryBrief).questionCount === 'number';

/**
 * The room's quiz set as every response shows it. Content owns the set (description and thumbnail
 * included); assessment keeps only the title, so those two stay `null` to keep the response shape.
 */
export function toQuizSetBrief(
    room: { quizSetId: string; quizSetTitle: string },
    summary?: QuizSetSummaryBrief
): QuizSetBrief {
    const brief: QuizSetBrief = {
        id: room.quizSetId,
        title: summary?.title ?? room.quizSetTitle,
        description: null,
        thumbnail: null,
    };
    if (summary?.questionCount !== undefined) brief.questionCount = summary.questionCount;
    return brief;
}

/**
 * Quiz-set titles and question counts for TEACHER views, asked of content-service with the teacher's own token (content
 * answers only for the owner). One batch call for everything the cache lacks; fail-soft, so a content
 * outage leaves the title stored on the room. Student views never come here.
 */
@Injectable()
export class QuizSetTitles {
    private readonly logger = new Logger(QuizSetTitles.name);

    constructor(
        private readonly content: ContentClient,
        private readonly redis: RedisService
    ) {}

    /** id -> title and question count for the ids content knows (and the caller owns); the others are absent. */
    async summariesFor(ids: string[], metadata: Metadata): Promise<Map<string, QuizSetSummaryBrief>> {
        const unique = [...new Set(ids)];
        const summaries = new Map<string, QuizSetSummaryBrief>();
        const missing: string[] = [];
        await Promise.all(
            unique.map(async (id) => {
                const cached = await this.readCache(id);
                if (cached !== null) summaries.set(id, cached);
                else missing.push(id);
            })
        );
        for (let i = 0; i < missing.length; i += MAX_IDS_PER_CALL) {
            try {
                const rows = await this.content.getQuizSetsByIds(missing.slice(i, i + MAX_IDS_PER_CALL), metadata);
                await Promise.all(
                    rows.map(async (row) => {
                        const summary = { title: row.title, questionCount: row.questionCount ?? 0 };
                        summaries.set(row.id, summary);
                        await this.writeCache(row.id, summary);
                    })
                );
            } catch (error) {
                this.logger.warn(`Quiz set titles from the stored copy: ${(error as Error).message}`);
                break;
            }
        }
        return summaries;
    }

    /** Rooms with `quizSet: { id, title, ... }`: the fresh title when content knows the set, the stored one otherwise. */
    async withQuizSets<T extends { quizSetId: string; quizSetTitle: string }>(
        rooms: T[],
        metadata: Metadata
    ): Promise<Array<T & { quizSet: QuizSetBrief }>> {
        const summaries = rooms.length > 0 ? await this.summariesFor(rooms.map((r) => r.quizSetId), metadata) : new Map();
        return rooms.map((room) => ({ ...room, quizSet: toQuizSetBrief(room, summaries.get(room.quizSetId)) }));
    }

    private async readCache(id: string): Promise<QuizSetSummaryBrief | null> {
        try {
            const cached = await this.redis.get<unknown>(quizSetTitleKey(id));
            // An entry in any other shape (an older bare title) is a miss, refreshed from content.
            return isSummary(cached) ? cached : null;
        } catch (error) {
            this.logger.warn(`Quiz set title cache read failed: ${(error as Error).message}`);
            return null;
        }
    }

    private async writeCache(id: string, summary: QuizSetSummaryBrief): Promise<void> {
        try {
            await this.redis.set(quizSetTitleKey(id), summary, EXPIRED_TIME.FIVE_MINUTES);
        } catch (error) {
            this.logger.warn(`Quiz set title cache write failed: ${(error as Error).message}`);
        }
    }
}
