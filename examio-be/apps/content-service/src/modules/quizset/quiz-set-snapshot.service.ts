import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { computeContentHash, type HashLabel, type HashQuestion } from './content-hash';

export const SNAPSHOT_SCHEMA_VERSION = 1;
/** `GetQuizSetsByIds` takes at most this many ids (one query, bounded work). */
export const MAX_SUMMARY_IDS = 50;

export interface QuizSetContent {
    id: string;
    title: string;
    ownerId: string;
    labels: HashLabel[];
    questions: HashQuestion[];
    contentHash: string;
}

export interface QuizSetSummaryRow {
    id: string;
    title: string;
    questionCount: number;
    contentHash?: string;
}

/**
 * Reads the owner's quiz sets in the shape assessment snapshots. Every read is scoped by `userId`
 * in the `where` itself, so a foreign or missing set is simply absent (the caller maps that to
 * NOT_FOUND / omission): there is no way to tell the two apart.
 */
@Injectable()
export class QuizSetSnapshotService {
    constructor(private readonly prisma: PrismaService) {}

    /** The full content of one owned set, or `null`. One query (questions + labels). */
    async snapshot(ownerId: string, quizSetId: string): Promise<QuizSetContent | null> {
        const rows = await this.load(ownerId, [quizSetId]);
        return rows[0] ?? null;
    }

    /** Summaries of the owned sets among `ids`; `contentHash` only on request (it reads every question). */
    async summaries(ownerId: string, ids: string[], withContentHash: boolean): Promise<QuizSetSummaryRow[]> {
        const unique = [...new Set(ids.filter((id) => id.trim().length > 0))];
        if (unique.length === 0) return [];
        if (!withContentHash) {
            const rows = await this.prisma.quizSet.findMany({
                where: { id: { in: unique }, userId: ownerId },
                select: { id: true, title: true, _count: { select: { detailsQuizQuestions: true } } },
            });
            return rows.map((row) => ({
                id: row.id,
                title: row.title,
                questionCount: row._count.detailsQuizQuestions,
            }));
        }
        return (await this.load(ownerId, unique)).map((row) => ({
            id: row.id,
            title: row.title,
            questionCount: row.questions.length,
            contentHash: row.contentHash,
        }));
    }

    async stats(ownerId: string): Promise<{ quizSetCount: number; flashcardSetCount: number }> {
        const [quizSetCount, flashcardSetCount] = await Promise.all([
            this.prisma.quizSet.count({ where: { userId: ownerId } }),
            this.prisma.flashCardSet.count({ where: { userId: ownerId } }),
        ]);
        return { quizSetCount, flashcardSetCount };
    }

    private async load(ownerId: string, ids: string[]): Promise<QuizSetContent[]> {
        const sets = await this.prisma.quizSet.findMany({
            where: { id: { in: ids }, userId: ownerId },
            select: {
                id: true,
                title: true,
                userId: true,
                labels: {
                    select: { id: true, name: true, order: true, color: true },
                    orderBy: [{ order: 'asc' }, { id: 'asc' }],
                },
                detailsQuizQuestions: {
                    select: {
                        labelId: true,
                        quizQuestion: { select: { id: true, question: true, options: true, answer: true } },
                    },
                    // The order the owner sees the questions in (createdAt, then id).
                    orderBy: [{ quizQuestion: { createdAt: 'asc' } }, { quizQuestionId: 'asc' }],
                },
            },
        });
        return sets.map((set) => {
            const labels: HashLabel[] = set.labels.map((l) => ({ ...l, color: l.color ?? null }));
            const questions: HashQuestion[] = set.detailsQuizQuestions.map((d, order) => ({
                id: d.quizQuestion.id,
                question: d.quizQuestion.question,
                options: d.quizQuestion.options,
                answer: d.quizQuestion.answer,
                labelId: d.labelId ?? null,
                order,
            }));
            return {
                id: set.id,
                title: set.title,
                ownerId: set.userId,
                labels,
                questions,
                contentHash: computeContentHash(labels, questions),
            };
        });
    }
}
