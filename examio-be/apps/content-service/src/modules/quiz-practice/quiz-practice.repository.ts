import { Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma';
import { PrismaService } from '../../prisma';
import type { AttemptRow } from './quiz-practice.mapper';

export interface QuestionRow {
    id: string;
    question: string;
    options: string[];
    /** Only the scoring path reads this; the mapper never copies it out. */
    answer: string;
}

type Db = Pick<PrismaService, 'quizPracticeAttempt' | 'detailsQuizQuestion'>;

export const ATTEMPT_SELECT = {
    id: true,
    quizSetId: true,
    type: true,
    answers: true,
    currentIndex: true,
    markedQuestions: true,
    timeSpentSeconds: true,
    timeLimitMinutes: true,
    isSubmitted: true,
    score: true,
    totalQuestions: true,
    correctAnswers: true,
    resultSnapshot: true,
    startedAt: true,
    submittedAt: true,
    updatedAt: true,
} satisfies Prisma.QuizPracticeAttemptSelect;

/** Prisma access for practice attempts: explicit selects only, the owner is always in `where`. */
@Injectable()
export class QuizPracticeRepository {
    constructor(private readonly prisma: PrismaService) {}

    /** Questions of a set in a stable order, with the key (scoring only). */
    async findQuestions(quizSetId: string, db: Db = this.prisma): Promise<QuestionRow[]> {
        const rows = await db.detailsQuizQuestion.findMany({
            where: { quizSetId },
            orderBy: [{ quizQuestion: { createdAt: 'asc' } }, { quizQuestionId: 'asc' }],
            select: {
                quizQuestion: {
                    select: { id: true, question: true, options: true, answer: true },
                },
            },
        });
        return rows.map((r) => r.quizQuestion);
    }

    findOwned(id: string, userId: string, db: Db = this.prisma): Promise<AttemptRow | null> {
        return db.quizPracticeAttempt.findFirst({
            where: { id, userId },
            select: ATTEMPT_SELECT,
        });
    }

    findOpen(quizSetId: string, userId: string, db: Db = this.prisma): Promise<AttemptRow | null> {
        return db.quizPracticeAttempt.findFirst({
            where: { quizSetId, userId, isSubmitted: false },
            orderBy: { updatedAt: 'desc' },
            select: ATTEMPT_SELECT,
        });
    }
}
