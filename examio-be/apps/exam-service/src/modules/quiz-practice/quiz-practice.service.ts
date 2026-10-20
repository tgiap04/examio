import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@examio/database';
import { RedisService } from '@examio/redis';
import type { AuthUser } from '@examio/auth-jwt';
import { verifyAccessCodeOrThrow } from '../common/access-code-guard';
import { appendCodeGranted } from '../common/sharing-list.util';
import {
    QUIZ_SET_ACCESS_SELECT,
    accessKindOf,
} from '../quizset/quizset-access';
import type { ListSetsQueryDto } from './dto/quiz-practice.dto';
import { toAttemptView, toPracticeQuestions } from './quiz-practice.mapper';
import { ATTEMPT_SELECT, QuizPracticeRepository } from './quiz-practice.repository';

const SET_NOT_FOUND = 'Bộ câu hỏi không tồn tại';

@Injectable()
export class QuizPracticeService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly repo: QuizPracticeRepository
    ) {}

    /** Sets I am granted (whitelist / code), plus public sets I already practised. One query + count. */
    async listSets(user: AuthUser, { page, limit }: ListSetsQueryDto) {
        const where: Prisma.QuizSetWhereInput = {
            OR: [
                { whitelist: { has: user.id } },
                { codeGrantedIds: { has: user.id } },
                { isPublic: true, practiceAttempts: { some: { userId: user.id } } },
            ],
        };
        const [rows, total] = await Promise.all([
            this.prisma.quizSet.findMany({
                where,
                orderBy: { updatedAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    title: true,
                    description: true,
                    thumbnail: true,
                    user: { select: { name: true } },
                    _count: { select: { detailsQuizQuestions: true } },
                    practiceAttempts: {
                        where: { userId: user.id },
                        orderBy: { updatedAt: 'desc' },
                        take: 1,
                        select: { id: true, isSubmitted: true, score: true, updatedAt: true },
                    },
                },
            }),
            this.prisma.quizSet.count({ where }),
        ]);
        return {
            sets: rows.map((s) => {
                const last = s.practiceAttempts[0];
                return {
                    id: s.id,
                    title: s.title,
                    description: s.description,
                    thumbnail: s.thumbnail,
                    questionCount: s._count.detailsQuizQuestions,
                    owner: { name: s.user.name },
                    lastAttempt: last
                        ? {
                              id: last.id,
                              isSubmitted: last.isSubmitted,
                              score: last.isSubmitted ? last.score : null,
                              updatedAt: last.updatedAt,
                          }
                        : null,
                };
            }),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Can this (maybe anonymous) caller practise the set? Never returns the code
     * or any list. A private set with no code is not revealed (404).
     */
    async getAccess(quizSetId: string, userId: string | undefined) {
        const row = await this.prisma.quizSet.findFirst({
            where: { id: quizSetId },
            select: {
                ...QUIZ_SET_ACCESS_SELECT,
                title: true,
                accessCode: true,
                _count: { select: { detailsQuizQuestions: true } },
            },
        });
        if (!row) throw new NotFoundException(SET_NOT_FOUND);
        const reason = accessKindOf(row, userId);
        const base = { title: row.title, questionCount: row._count.detailsQuizQuestions };
        if (reason) return { ...base, canAccess: true, requiresCode: false, reason };
        if (row.accessCode) {
            // Anonymous callers learn only that a code exists, not the title or size of a private set.
            return userId
                ? { ...base, canAccess: false, requiresCode: true, reason: null }
                : { canAccess: false, requiresCode: true, reason: null };
        }
        throw new NotFoundException(SET_NOT_FOUND);
    }

    /** Lockout + constant-time compare live in `verifyAccessCodeOrThrow`; success is remembered until the code changes. */
    async unlock(quizSetId: string, user: AuthUser, code: string) {
        const row = await this.prisma.quizSet.findFirst({
            where: { id: quizSetId },
            select: { ...QUIZ_SET_ACCESS_SELECT, accessCode: true },
        });
        if (!row) throw new NotFoundException(SET_NOT_FOUND);
        await verifyAccessCodeOrThrow(this.redis.getClient(), {
            resourceId: quizSetId,
            userId: user.id,
            stored: row.accessCode,
            given: code,
        });
        // Already granted another way (owner, public, whitelist): do not mint a code grant, so
        // revoking code unlocks later can never be mistaken for revoking their real grant.
        if (!accessKindOf(row, user.id)) {
            await appendCodeGranted(this.prisma, 'QuizSet', quizSetId, user.id, code);
        }
        return { canAccess: true };
    }

    /** Resume the latest unsubmitted attempt or open a new one. Answers are never sent. */
    async startAttempt(user: AuthUser, quizSetId: string) {
        const set = await this.prisma.quizSet.findFirst({
            where: { id: quizSetId },
            select: {
                ...QUIZ_SET_ACCESS_SELECT,
                _count: { select: { detailsQuizQuestions: true } },
            },
        });
        if (!set || !accessKindOf(set, user.id)) {
            throw new NotFoundException(SET_NOT_FOUND);
        }
        const attempt = await this.prisma.$transaction(async (tx) => {
            // One start at a time per user and set, so a double click can not open two attempts.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`qp:${quizSetId}:${user.id}`}))`;
            const open = await this.repo.findOpen(quizSetId, user.id, tx);
            if (open) return open;
            return tx.quizPracticeAttempt.create({
                data: {
                    quizSetId,
                    userId: user.id,
                    totalQuestions: set._count.detailsQuizQuestions,
                    createdBy: user.id,
                },
                select: ATTEMPT_SELECT,
            });
        });
        const questions = await this.repo.findQuestions(quizSetId);
        return { attempt: toAttemptView(attempt), questions: toPracticeQuestions(questions) };
    }
}
