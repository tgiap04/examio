import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { EXAM_ATTEMPT_STATUS } from '../../types';
import { canAccessExamRoom } from './student-exam-access';

@Injectable()
export class StudentExamService {
    constructor(private readonly prisma: PrismaService) {}

    async togglePinExamRoom(userId: string, examRoomId: string) {
        const existing = await this.prisma.userPinnedExamRoom.findUnique({
            where: {
                userId_examRoomId: { userId, examRoomId },
            },
        });

        if (existing) {
            await this.prisma.userPinnedExamRoom.delete({
                where: { id: existing.id },
            });
            return { pinned: false };
        }

        if (!(await canAccessExamRoom(this.prisma, examRoomId, userId))) {
            throw new NotFoundException('Exam room not found');
        }

        await this.prisma.userPinnedExamRoom.create({
            data: { userId, examRoomId },
        });
        return { pinned: true };
    }

    async getRecentExams(userId: string, limit: number, page: number = 1) {
        const skip = (page - 1) * limit;

        const where = { userId };

        const [examAttempts, total, pinnedRooms] = await Promise.all([
            this.prisma.examAttempt.findMany({
                where,
                include: {
                    examSession: {
                        include: {
                            examRoom: {
                                select: {
                                    id: true,
                                    title: true,
                                    description: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.examAttempt.count({ where }),
            this.prisma.userPinnedExamRoom.findMany({
                where,
                select: { examRoomId: true },
            }),
        ]);

        const pinnedRoomIds = new Set(pinnedRooms.map((p) => p.examRoomId));

        const formattedExamAttempts = examAttempts.map((attempt) => {
            const timeLimitMinutes = attempt.examSession.timeLimitMinutes;
            let timeRemaining: number | null = null;

            if (attempt.status === EXAM_ATTEMPT_STATUS.IN_PROGRESS && timeLimitMinutes) {
                const startedAt = new Date(attempt.startedAt).getTime();
                const now = Date.now();
                const elapsedMinutes = (now - startedAt) / (1000 * 60);
                timeRemaining = Math.max(0, timeLimitMinutes - elapsedMinutes);
            }

            return {
                id: attempt.id,
                examSessionId: attempt.examSessionId,
                score: attempt.score,
                violationCount: attempt.violationCount,
                startedAt: attempt.startedAt.toISOString(),
                finishedAt: attempt.finishedAt?.toISOString() || null,
                status: attempt.status,
                totalQuestions: attempt.totalQuestions,
                correctAnswers: attempt.correctAnswers,
                timeRemaining,
                isPinned: pinnedRoomIds.has(attempt.examSession.examRoom.id),
                examSession: {
                    id: attempt.examSession.id,
                    startTime: attempt.examSession.startTime.toISOString(),
                    endTime: attempt.examSession.endTime?.toISOString() || null,
                    timeLimitMinutes: attempt.examSession.timeLimitMinutes,
                    showAnswersAfterSubmit: attempt.examSession.showAnswersAfterSubmit,
                    examRoom: attempt.examSession.examRoom,
                },
            };
        });

        return {
            examAttempts: formattedExamAttempts,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
}
