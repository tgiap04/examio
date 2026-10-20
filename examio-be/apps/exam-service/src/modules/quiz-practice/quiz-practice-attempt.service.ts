import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@examio/database';
import type { AuthUser } from '@examio/auth-jwt';
import type { ListAttemptsQueryDto, SaveAttemptDto } from './dto/quiz-practice.dto';
import {
    toAttemptView,
    toPracticeQuestions,
    toResultQuestions,
} from './quiz-practice.mapper';
import { QUIZ_SET_ACCESS_SELECT, accessKindOf } from '../quizset/quizset-access';
import { ATTEMPT_SELECT, QuizPracticeRepository } from './quiz-practice.repository';
import { scoreAttempt } from './quiz-practice-scoring';

const ATTEMPT_NOT_FOUND = 'Bài luyện tập không tồn tại';

const alreadySubmitted = () =>
    new ConflictException({
        statusCode: 409,
        code: 'ALREADY_SUBMITTED',
        message: 'Bài luyện tập đã được nộp',
    });

/**
 * Attempts belong to their examinee: every query carries `userId` in `where`
 * (another user's attempt is a 404). Scoring runs on the server from the stored
 * answers; nothing the client sends about a score is read.
 */
@Injectable()
export class QuizPracticeAttemptService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly repo: QuizPracticeRepository
    ) {}

    /**
     * An OPEN attempt is only usable while the caller still has access to the set
     * (owner, public, whitelist, current code): losing access ends it with a 404,
     * so the answer key can not be pulled out afterwards. A SUBMITTED attempt is the
     * student's own record and stays readable; it is served from the snapshot taken
     * at submit, so later edits to the set never change a past result.
     */
    private async assertStillGranted(
        quizSetId: string,
        userId: string,
        db: Pick<PrismaService, 'quizSet'> = this.prisma
    ): Promise<void> {
        const set = await db.quizSet.findFirst({
            where: { id: quizSetId },
            select: QUIZ_SET_ACCESS_SELECT,
        });
        if (!set || !accessKindOf(set, userId)) {
            throw new NotFoundException(ATTEMPT_NOT_FOUND);
        }
    }

    /** Open attempt: questions without the key. Submitted attempt: the stored questions with the key and the verdicts. */
    async getAttempt(user: AuthUser, id: string) {
        const attempt = await this.repo.findOwned(id, user.id);
        if (!attempt) throw new NotFoundException(ATTEMPT_NOT_FOUND);
        if (!attempt.isSubmitted) {
            await this.assertStillGranted(attempt.quizSetId, user.id);
            const questions = await this.repo.findQuestions(attempt.quizSetId);
            return { attempt: toAttemptView(attempt), questions: toPracticeQuestions(questions) };
        }
        if (Array.isArray(attempt.resultSnapshot)) {
            return { attempt: toAttemptView(attempt), questions: attempt.resultSnapshot };
        }
        // Submitted before snapshots existed: re-score against the current questions.
        const questions = await this.repo.findQuestions(attempt.quizSetId);
        return {
            attempt: toAttemptView(attempt),
            questions: toResultQuestions(
                questions,
                scoreAttempt(questions, this.answersOf(attempt.answers)).perQuestion
            ),
        };
    }

    async saveAttempt(user: AuthUser, id: string, dto: SaveAttemptDto) {
        const current = await this.repo.findOwned(id, user.id);
        if (!current) throw new NotFoundException(ATTEMPT_NOT_FOUND);
        if (current.isSubmitted) throw alreadySubmitted();
        await this.assertStillGranted(current.quizSetId, user.id);
        const { count } = await this.prisma.quizPracticeAttempt.updateMany({
            where: { id, userId: user.id, isSubmitted: false },
            data: {
                answers: dto.answers,
                currentIndex: dto.currentIndex,
                markedQuestions: dto.markedQuestions,
                timeSpentSeconds: dto.timeSpentSeconds,
                updatedBy: user.id,
            },
        });
        if (count === 0) {
            const exists = await this.repo.findOwned(id, user.id);
            throw exists ? alreadySubmitted() : new NotFoundException(ATTEMPT_NOT_FOUND);
        }
        return { saved: true };
    }

    /**
     * The row is locked (`FOR UPDATE`) for the whole submit, so a late autosave
     * waits, then sees `isSubmitted` and gets a 409; the score is computed from
     * exactly the answers that stay on the row.
     */
    async submitAttempt(user: AuthUser, id: string) {
        const { attempt, questions, scored } = await this.prisma.$transaction(async (tx) => {
            const locked = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT "id" FROM "QuizPracticeAttempt"
                WHERE "id" = ${id} AND "userId" = ${user.id} FOR UPDATE`;
            if (locked.length === 0) throw new NotFoundException(ATTEMPT_NOT_FOUND);
            const current = await this.repo.findOwned(id, user.id, tx);
            if (!current) throw new NotFoundException(ATTEMPT_NOT_FOUND);
            if (current.isSubmitted) throw alreadySubmitted();
            await this.assertStillGranted(current.quizSetId, user.id, tx);
            const rows = await this.repo.findQuestions(current.quizSetId, tx);
            const result = scoreAttempt(rows, this.answersOf(current.answers));
            const done = await tx.quizPracticeAttempt.update({
                where: { id },
                data: {
                    isSubmitted: true,
                    score: result.score,
                    correctAnswers: result.correct,
                    totalQuestions: result.total,
                    submittedAt: new Date(),
                    resultSnapshot: toResultQuestions(rows, result.perQuestion) as Prisma.InputJsonValue,
                    updatedBy: user.id,
                },
                select: ATTEMPT_SELECT,
            });
            return { attempt: done, questions: rows, scored: result };
        });
        return {
            attempt: toAttemptView(attempt),
            questions: toResultQuestions(questions, scored.perQuestion),
        };
    }

    /** Submitted history, newest first. `userId` is always me, whatever `quizSetId` says. */
    async listAttempts(user: AuthUser, { quizSetId, page, limit }: ListAttemptsQueryDto) {
        const where = {
            userId: user.id,
            isSubmitted: true,
            ...(quizSetId ? { quizSetId } : {}),
        };
        const [attempts, total] = await Promise.all([
            this.prisma.quizPracticeAttempt.findMany({
                where,
                orderBy: { submittedAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    quizSetId: true,
                    score: true,
                    totalQuestions: true,
                    correctAnswers: true,
                    timeSpentSeconds: true,
                    startedAt: true,
                    submittedAt: true,
                    quizSet: { select: { title: true } },
                },
            }),
            this.prisma.quizPracticeAttempt.count({ where }),
        ]);
        return { attempts, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    private answersOf(value: unknown): Record<string, unknown> {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};
    }
}
