import { PrismaService } from '../../prisma';
import { rethrowKnown } from '../common/rethrow-known';
import {
    Injectable,
    NotFoundException,
    InternalServerErrorException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { GenerateIdService } from '@kmaedu/common';
import { RedisService } from '@kmaedu/redis';
import type { Metadata } from '@grpc/grpc-js';

import { EXAM_SESSION_STATUS, ASSESS_TYPE, QUESTION_SELECTION_MODE, LabelQuestionConfig } from '../../types';
import { CreateExamSessionDto } from './dto/create-examsession.dto';
import { GetExamSessionsDto } from './dto/get-examsession.dto';
import { UpdateExamSessionDto } from './dto/update-examsession.dto';
import { ExamSessionUpdateSharingSettingsDto } from './dto/sharing.dto';
import { ExamSessionRepository } from './examsession.repository';
import { ExamRoomRepository } from '../examroom/examroom.repository';
import type { AuthUser } from '@kmaedu/auth-jwt';
import {
    generateAccessCode,
    verifyAccessCodeOrThrow,
} from '../common/access-code-guard';
import {
    SHARE_LIST_CAP,
    ShareListFullException,
    appendCodeGranted,
} from '../common/code-granted';
import {
    toExamSessionPublicView,
    toExamSessionStudyView,
} from './examsession-public.mapper';
import { UserEnricher } from '../user-profile/user-enricher.service';
import { toQuizSetBrief } from '../examroom/quiz-set-titles.cache';
import { QuizSetDeletedException, snapshotColumns } from '../snapshot/quiz-snapshot';
import { canRefresh, SnapshotDrift } from '../snapshot/snapshot-drift';
import { labelStats, validateSelectionConfig } from '../snapshot/snapshot.reader';
import { SnapshotStore } from '../snapshot/snapshot.store';
import { SnapshotTaker } from '../snapshot/snapshot-taker';
import { lockSessionRow, SnapshotLockedException } from '../snapshot/session-lock';

@Injectable()
export class ExamSessionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly examSessionRepository: ExamSessionRepository,
        private readonly examRoomRepository: ExamRoomRepository,
        private readonly generateIdService: GenerateIdService,
        private readonly redis: RedisService,
        private readonly users: UserEnricher,
        private readonly snapshotTaker: SnapshotTaker,
        private readonly snapshots: SnapshotStore,
        private readonly drift: SnapshotDrift
    ) {}

    /** The room as every session response embeds it: the stored quiz set title, never a content call. */
    private withQuizSet<R extends { quizSetId: string; quizSetTitle: string }>(room: R) {
        return { ...room, quizSet: toQuizSetBrief(room) };
    }

    private withRoomQuizSet<S extends { examRoom: { quizSetId: string; quizSetTitle: string } }>(session: S) {
        return { ...session, examRoom: this.withQuizSet(session.examRoom) };
    }

    /** `examRoom.host` comes from auth (one batched lookup), never from a relation include. */
    private async withHost<T>(session: T | null): Promise<T | null> {
        if (!session) return null;
        return (await this.users.withRoomHost(
            session as T & { examRoom: { hostId: string } }
        )) as T;
    }

    /**
     * The host's room detail embeds `examSessions` and the room list embeds the
     * session count, both cached for minutes: any session write must drop them.
     * Best-effort like the other invalidations: the write already succeeded.
     */
    private async invalidateRoomCache(hostId: string, roomId: string) {
        try {
            await this.examRoomRepository.invalidateItemCache(hostId, roomId);
            await this.examRoomRepository.invalidateUserListCache(hostId);
        } catch (error) {
            console.warn(
                `[examSession] room cache invalidation failed for room ${roomId}:`,
                (error as Error).message
            );
        }
    }

    async createExamSession(user: AuthUser, dto: CreateExamSessionDto, metadata: Metadata) {
        // Verify exam room exists and belongs to user
        // Not cached: `sourceDeleted` flips on an event, and a stale `false` would let a session through.
        const examRoom = await this.examRoomRepository.findOne({
            where: { id: dto.examRoomId },
            cache: false,
        });

        if (!examRoom) {
            throw new NotFoundException('Phòng thi không tồn tại');
        }

        if (examRoom.hostId !== user.id) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        if (examRoom.sourceDeleted) {
            throw new QuizSetDeletedException();
        }

        const startTime = new Date(dto.startTime);
        const endTime = dto.endTime ? new Date(dto.endTime) : null;

        if (endTime && endTime <= startTime) {
            throw new BadRequestException(
                'Thời gian kết thúc phải sau thời gian bắt đầu'
            );
        }

        try {
            // The quiz as it is right now, copied into the session: from here on the session never reads
            // content again (edits and deletes of the set do not reach it).
            const snapshot = await this.snapshotTaker.take(examRoom.quizSetId, metadata);
            validateSelectionConfig(snapshot, {
                mode: dto.questionSelectionMode ?? QUESTION_SELECTION_MODE.ALL,
                questionCount: dto.questionCount ?? null,
                labelConfig: dto.labelQuestionConfig ?? null,
            });

            const newExamSession = await this.examSessionRepository.create(
                {
                    id: this.generateIdService.generateId(),
                    examRoomId: dto.examRoomId,
                    startTime,
                    endTime,
                    autoJoinByLink: dto.autoJoinByLink || false,
                    status: EXAM_SESSION_STATUS.UPCOMING,
                    // Security and access control fields
                    assessType: dto.assessType ?? ASSESS_TYPE.PUBLIC,
                    allowRetake: dto.allowRetake || false,
                    maxAttempts: dto.maxAttempts || 1,
                    accessCode: dto.accessCode || null,
                    whitelist: dto.whitelist || [],
                    showAnswersAfterSubmit: dto.showAnswersAfterSubmit ?? true,
                    // Question selection configuration
                    questionCount: dto.questionCount ?? null,
                    questionSelectionMode: dto.questionSelectionMode ?? QUESTION_SELECTION_MODE.ALL,
                    labelQuestionConfig: dto.labelQuestionConfig ?? null,
                    shuffleQuestions: dto.shuffleQuestions ?? false,
                    ...snapshotColumns(snapshot),
                },
                user.id
            );
            await this.invalidateRoomCache(user.id, dto.examRoomId);

            // Load relations for response
            const examSessionWithRelations =
                await this.examSessionRepository.findOne({
                    where: { id: newExamSession.id },
                    include: { examRoom: true },
                    cache: false,
                });

            return {
                message: 'Tạo phiên thi thành công',
                examSession: await this.withHost(
                    examSessionWithRelations && this.withRoomQuizSet(examSessionWithRelations as never)
                ),
            };
        } catch (error) {
            rethrowKnown(error);
            throw new InternalServerErrorException('Tạo phiên thi thất bại');
        }
    }

    async getExamSessionById(id: string, user: AuthUser, metadata: Metadata) {
        const examSession = await this.examSessionRepository.findOne({
            where: { id },
            include: {
                examRoom: true,
                _count: {
                    select: {
                        examAttempts: true,
                    },
                },
            },
            cache: true,
        });

        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        const room = (examSession as any).examRoom as {
            hostId: string;
            quizSetId: string;
            quizSetTitle: string;
            sourceDeleted: boolean;
        };
        if (room.hostId !== user.id) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        // The row above may come from the Redis cache: the attempt count that decides `canRefreshSnapshot`
        // is read fresh (one indexed COUNT), and the drift check is one fail-soft call to content.
        const attemptCount = await this.prisma.examAttempt.count({ where: { examSessionId: id } });
        const [annotated] = await this.drift.annotate(
            room,
            [{ ...examSession, attemptCount }] as Array<typeof examSession & { attemptCount: number }>,
            metadata
        );
        const { attemptCount: _attemptCount, ...view } = annotated;
        return this.withHost(this.withRoomQuizSet(view as never));
    }

    async deleteExamSession(id: string, user: AuthUser) {
        const examSession = await this.examSessionRepository.findOne({
            where: { id },
            include: { examRoom: true },
            cache: false,
        });

        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        if ((examSession as any).examRoom.hostId !== user.id) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        // Hard delete - pass userId for proper cache invalidation
        await this.examSessionRepository.delete(id, user.id);
        await this.invalidateRoomCache(user.id, examSession.examRoomId);
        return { message: 'Xóa phiên thi thành công' };
    }

    async getExamSessionPublicById(id: string) {
        const examSession = await this.prisma.examSession.findUnique({
            where: { id },
            include: { examRoom: true },
        });

        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        // Check if public access
        if (examSession.assessType !== ASSESS_TYPE.PUBLIC) {
            throw new ForbiddenException(
                'Phiên thi này yêu cầu quyền truy cập'
            );
        }

        return toExamSessionPublicView(
            await this.users.withRoomHost(this.withRoomQuizSet(examSession))
        );
    }

    async getExamSessions(user: AuthUser, dto: GetExamSessionsDto) {
        const where: any = {
            examRoom: {
                hostId: user.id,
            },
        };

        if (dto.examRoomId) {
            where.examRoomId = dto.examRoomId;
        }

        if (dto.status !== undefined) {
            where.status = dto.status;
        }

        const result = await this.examSessionRepository.paginate(
            {
                page: dto.page || 1,
                size: dto.limit || 10,
                ...where,
                include: {
                    examRoom: {
                        select: {
                            id: true,
                            title: true,
                            quizSetId: true,
                            quizSetTitle: true,
                        },
                    },
                    _count: {
                        select: {
                            examAttempts: true,
                        },
                    },
                },
                sortBy: 'startTime',
                sortType: 'desc',
                cache: true,
            },
            user.id
        );

        return {
            examSessions: (result.data as unknown as Array<{ examRoom: { quizSetId: string; quizSetTitle: string } }>).map((s) =>
                this.withRoomQuizSet(s)
            ),
            total: result.total,
            page: result.page,
            limit: result.size,
            totalPages: result.totalPages,
        };
    }

    async updateExamSession(id: string, user: AuthUser, dto: UpdateExamSessionDto) {
        const examSession = await this.examSessionRepository.findOne({
            where: { id },
            include: { examRoom: true },
            cache: false,
        });

        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        if ((examSession as any).examRoom.hostId !== user.id) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        const updateData: any = {};

        if (dto.startTime) {
            updateData.startTime = new Date(dto.startTime);
        }

        if (dto.endTime) {
            updateData.endTime = new Date(dto.endTime);
        }

        if (updateData.startTime && updateData.endTime) {
            if (updateData.endTime <= updateData.startTime) {
                throw new BadRequestException(
                    'Thời gian kết thúc phải sau thời gian bắt đầu'
                );
            }
        }

        if (dto.status !== undefined) {
            updateData.status = dto.status;
        }

        if (dto.autoJoinByLink !== undefined) {
            updateData.autoJoinByLink = dto.autoJoinByLink;
        }

        // Security and access control fields
        if (dto.assessType !== undefined) {
            updateData.assessType = dto.assessType;
        }

        if (dto.allowRetake !== undefined) {
            updateData.allowRetake = dto.allowRetake;
        }

        if (dto.maxAttempts !== undefined) {
            updateData.maxAttempts = dto.maxAttempts;
        }

        if (dto.accessCode !== undefined) {
            updateData.accessCode = dto.accessCode;
            // A changed or removed code revokes everyone who unlocked the old one.
            if (dto.accessCode !== examSession.accessCode) {
                updateData.codeGrantedIds = [];
            }
        }

        if (dto.whitelist !== undefined) {
            this.assertWhitelistWithinCap(dto.whitelist);
            updateData.whitelist = dto.whitelist;
        }

        if (dto.showAnswersAfterSubmit !== undefined) {
            updateData.showAnswersAfterSubmit = dto.showAnswersAfterSubmit;
        }

        if (dto.passingScore !== undefined) {
            updateData.passingScore = dto.passingScore;
        }

        // Question selection configuration
        if (dto.questionCount !== undefined) {
            updateData.questionCount = dto.questionCount;
        }

        if (dto.questionSelectionMode !== undefined) {
            updateData.questionSelectionMode = dto.questionSelectionMode;
        }

        if (dto.labelQuestionConfig !== undefined) {
            updateData.labelQuestionConfig = dto.labelQuestionConfig;
        }

        if (dto.shuffleQuestions !== undefined) {
            updateData.shuffleQuestions = dto.shuffleQuestions;
        }

        // Validate question selection configuration if being updated
        if (
            dto.questionSelectionMode !== undefined ||
            dto.questionCount !== undefined ||
            dto.labelQuestionConfig !== undefined
        ) {
            // Against the session's OWN snapshot: a PUT never touches it (only refresh-snapshot does).
            const snapshot = await this.snapshots.load(id, examSession.quizSnapshotHash);
            validateSelectionConfig(snapshot, {
                mode: dto.questionSelectionMode ?? examSession.questionSelectionMode,
                questionCount: dto.questionCount !== undefined ? dto.questionCount : examSession.questionCount,
                labelConfig:
                    dto.labelQuestionConfig !== undefined
                        ? dto.labelQuestionConfig
                        : (examSession.labelQuestionConfig as LabelQuestionConfig[] | null),
            });
        }

        try {
            await this.examSessionRepository.update(id, updateData, user.id);
            await this.invalidateRoomCache(user.id, examSession.examRoomId);

            // Load with relations for response
            const updatedExamSession = await this.examSessionRepository.findOne(
                {
                    where: { id },
                    include: { examRoom: true },
                    cache: false,
                }
            );

            return {
                message: 'Cập nhật phiên thi thành công',
                examSession: await this.withHost(
                    updatedExamSession && this.withRoomQuizSet(updatedExamSession as never)
                ),
            };
        } catch (error) {
            rethrowKnown(error);
            if (error.code === 'P2025') {
                throw new NotFoundException('Phiên thi không tồn tại');
            }
            throw new InternalServerErrorException(
                'Cập nhật phiên thi thất bại'
            );
        }
    }

    // ==================== ACCESS CONTROL METHODS ====================

    /**
     * Check access for an exam session (public endpoint)
     */
    async checkAccess(id: string, userId?: string) {
        const examSession = await this.prisma.examSession.findUnique({
            where: { id },
            select: {
                id: true,
                assessType: true,
                accessCode: true,
                whitelist: true,
                codeGrantedIds: true,
                examRoom: {
                    select: {
                        hostId: true,
                    },
                },
            },
        });

        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        // Public access
        if (examSession.assessType === ASSESS_TYPE.PUBLIC) {
            return {
                hasAccess: true,
                accessType: 'public' as const,
            };
        }

        // Owner access
        if (userId && examSession.examRoom.hostId === userId) {
            return {
                hasAccess: true,
                accessType: 'owner' as const,
            };
        }

        // Whitelist access
        if (userId && examSession.whitelist.includes(userId)) {
            return {
                hasAccess: true,
                accessType: 'whitelist' as const,
            };
        }

        // Unlocked the current code earlier (cleared when the code changes)
        if (userId && examSession.codeGrantedIds.includes(userId)) {
            return {
                hasAccess: true,
                accessType: 'code' as const,
            };
        }

        // Code required
        if (examSession.accessCode) {
            return {
                hasAccess: false,
                accessType: 'code_required' as const,
                requiresCode: true,
            };
        }

        return {
            hasAccess: false,
            accessType: 'denied' as const,
        };
    }

    /**
     * Verify the access code of a session. Auth is required (see the
     * controller); the attempt counter lives per session and user.
     */
    async verifyAccessCode(id: string, accessCode: unknown, userId: string) {
        const examSession = await this.prisma.examSession.findUnique({
            where: { id },
            select: { accessCode: true },
        });

        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        await verifyAccessCodeOrThrow(this.redis.getClient(), {
            resourceId: id,
            userId,
            stored: examSession.accessCode,
            given: accessCode,
        });

        return {
            valid: true,
            message: 'Mã xác thực hợp lệ',
        };
    }

    /**
     * Get exam session for study. Public, host or whitelisted callers get the
     * answer-free payload; a caller with no grant gets 404, a code-protected
     * session asks for the code.
     */
    async getExamSessionForStudy(id: string, userId: string) {
        const accessInfo = await this.checkAccess(id, userId);
        this.assertStudyAccess(accessInfo);
        return this.loadStudyView(id, userId);
    }

    /** Get exam session after code verification (same answer-free payload). */
    async getExamSessionWithCode(id: string, accessCode: unknown, userId: string) {
        await this.verifyAccessCode(id, accessCode, userId);
        // Remembered until the code changes, so the next visit skips the prompt.
        await appendCodeGranted(this.prisma, id, userId, String(accessCode));
        return this.loadStudyView(id, userId);
    }

    private assertStudyAccess(accessInfo: { hasAccess: boolean; accessType: string }) {
        if (accessInfo.accessType === 'code_required') {
            throw new ForbiddenException({
                statusCode: 403,
                code: 'CODE_REQUIRED',
                message: 'Yêu cầu mã truy cập',
            });
        }
        if (!accessInfo.hasAccess) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }
    }

    private async loadStudyView(id: string, userId: string) {
        const examSession = await this.prisma.examSession.findUnique({
            where: { id },
            include: { examRoom: true },
        });

        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        // The questions come from the session's snapshot; the mapper strips the answer key.
        const snapshot = await this.snapshots.load(id, examSession.quizSnapshotHash);
        return toExamSessionStudyView(
            await this.users.withRoomHost(this.withRoomQuizSet(examSession)),
            snapshot.questions,
            examSession.examRoom.hostId === userId
        );
    }

    /**
     * Get public info for an exam session (without questions)
     */
    async getExamSessionPublicInfo(id: string) {
        const examSession = await this.prisma.examSession.findUnique({
            where: { id },
            select: {
                id: true,
                status: true,
                startTime: true,
                endTime: true,
                assessType: true,
                accessCode: true,
                examRoom: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        hostId: true,
                    },
                },
            },
        });

        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        return {
            id: examSession.id,
            title: examSession.examRoom.title,
            description: examSession.examRoom.description,
            startTime: examSession.startTime.toISOString(),
            endTime: examSession.endTime?.toISOString(),
            status: examSession.status,
            isPublic: examSession.assessType === ASSESS_TYPE.PUBLIC,
            requiresCode:
                examSession.assessType !== ASSESS_TYPE.PUBLIC &&
                !!examSession.accessCode,
            creator: (await this.users.withHost(examSession.examRoom)).host,
            examRoom: {
                id: examSession.examRoom.id,
                title: examSession.examRoom.title,
                description: examSession.examRoom.description,
            },
        };
    }

    /**
     * Update sharing settings for an exam session
     */
    async updateSharingSettings(
        id: string,
        user: AuthUser,
        dto: ExamSessionUpdateSharingSettingsDto
    ) {
        // Check ownership
        const examSession = await this.prisma.examSession.findUnique({
            where: { id },
            include: { examRoom: true },
        });

        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        if (examSession.examRoom.hostId !== user.id) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        this.assertWhitelistWithinCap(dto.whitelist);
        const nextCode = dto.isPublic ? null : dto.accessCode;
        const codeChanged =
            nextCode !== undefined && nextCode !== examSession.accessCode;

        // Update sharing settings
        const updatedExamSession = await this.prisma.examSession.update({
            where: { id },
            data: {
                assessType: dto.isPublic
                    ? ASSESS_TYPE.PUBLIC
                    : ASSESS_TYPE.PRIVATE,
                accessCode: nextCode,
                whitelist: dto.isPublic ? [] : dto.whitelist || [],
                ...(codeChanged ? { codeGrantedIds: [] } : {}),
            },
            select: {
                id: true,
                assessType: true,
                accessCode: true,
                whitelist: true,
            },
        });

        await this.examSessionRepository.invalidateItemCache(user.id, id);
        await this.examSessionRepository.invalidateUserListCache(user.id);
        await this.invalidateRoomCache(user.id, examSession.examRoomId);

        return {
            message: 'Cập nhật cài đặt chia sẻ thành công',
            isPublic: updatedExamSession.assessType === ASSESS_TYPE.PUBLIC,
            accessCode: updatedExamSession.accessCode,
            whitelist: updatedExamSession.whitelist,
        };
    }

    /** The exam session host form still replaces the whole whitelist; the list is capped like every other. */
    private assertWhitelistWithinCap(whitelist: string[] | undefined): void {
        if ((whitelist?.length ?? 0) > SHARE_LIST_CAP) {
            throw new ShareListFullException();
        }
    }

    /**
     * New access code for the host's session. Only the code changes: the
     * whitelist and the visibility are kept (the old flow wiped the whitelist
     * and forced the session private).
     */
    async regenerateAccessCode(id: string, user: AuthUser) {
        const examSession = await this.prisma.examSession.findUnique({
            where: { id },
            select: { id: true, examRoomId: true, examRoom: { select: { hostId: true } } },
        });
        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }
        if (examSession.examRoom.hostId !== user.id) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }
        const accessCode = generateAccessCode();
        // Rotation: everyone who unlocked the old code loses access (whitelist kept).
        await this.prisma.examSession.update({
            where: { id },
            data: { accessCode, codeGrantedIds: [] },
        });
        await this.examSessionRepository.invalidateItemCache(user.id, id);
        await this.examSessionRepository.invalidateUserListCache(user.id);
        await this.invalidateRoomCache(user.id, examSession.examRoomId);

        return { accessCode };
    }

    /**
     * Get sharing settings for owner
     */
    async getSharingSettings(id: string, user: AuthUser) {
        const examSession = await this.prisma.examSession.findFirst({
            where: { id },
            select: {
                id: true,
                assessType: true,
                accessCode: true,
                whitelist: true,
                examRoom: {
                    select: {
                        hostId: true,
                    },
                },
            },
        });

        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        if (examSession.examRoom.hostId !== user.id) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        // Whitelist display data lives in auth: one batched lookup, list order kept.
        const profiles = await this.users.profileMap(examSession.whitelist);
        const users = examSession.whitelist.flatMap((uid) => {
            const p = profiles.get(uid);
            return p ? [p] : [];
        });

        return {
            id: examSession.id,
            isPublic: examSession.assessType === ASSESS_TYPE.PUBLIC,
            accessCode: examSession.accessCode,
            whitelist: users,
        };
    }

    /**
     * Get exam session stats for student display
     * Returns only required fields to avoid data leakage:
     * - durationMinutes: endTime - startTime (null if no endTime)
     * - totalQuestions: from quizSet
     * - passingScore: percentage (0 = no minimum)
     * - currentAttempt: current attempt number for user
     * - maxAttempts: null if unlimited
     * - progress: from latest in-progress attempt
     */
    async getExamSessionStatsForStudent(id: string, userId: string) {
        // Enforce the same access control as getExamSessionForStudy so
        // private/whitelisted session config cannot leak to unauthorized users.
        const accessInfo = await this.checkAccess(id, userId);
        this.assertStudyAccess(accessInfo);

        const examSession = await this.prisma.examSession.findUnique({
            where: { id },
            select: {
                id: true,
                status: true,
                startTime: true,
                endTime: true,
                passingScore: true,
                allowRetake: true,
                maxAttempts: true,
                questionCount: true,
                questionSelectionMode: true,
                shuffleQuestions: true,
                quizSnapshotHash: true,
                examRoom: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                    },
                },
            },
        });

        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        // Calculate duration in minutes if endTime exists
        let durationMinutes: number | null = null;
        if (examSession.endTime) {
            const start = examSession.startTime.getTime();
            const end = examSession.endTime.getTime();
            durationMinutes = Math.floor((end - start) / (1000 * 60));
        }

        // Total questions of the session's snapshot
        const totalQuestions = (
            await this.snapshots.load(id, examSession.quizSnapshotHash)
        ).questions.length;

        // Get user's attempts for this session
        const userAttempts = await this.prisma.examAttempt.findMany({
            where: {
                examSessionId: id,
                userId: userId,
            },
            select: {
                id: true,
                status: true,
                answers: true,
                markedQuestions: true,
                totalQuestions: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // Current attempt count
        const currentAttempt = userAttempts.length;

        // Max attempts - null if unlimited (allowRetake = false means only 1 try)
        const maxAttempts = examSession.allowRetake
            ? examSession.maxAttempts
            : null;

        // Find latest in-progress attempt for progress display
        const inProgressAttempt = userAttempts.find((a) => a.status === 0); // 0 = IN_PROGRESS

        // Calculate progress
        let progress = {
            answered: 0,
            marked: 0,
            total: totalQuestions,
        };

        if (inProgressAttempt) {
            const answers = inProgressAttempt.answers as Record<string, string>;
            progress.answered = Object.keys(answers).length;
            progress.marked = inProgressAttempt.markedQuestions.length;
            progress.total = inProgressAttempt.totalQuestions || totalQuestions;
        }

        return {
            id: examSession.id,
            title: examSession.examRoom.title,
            description: examSession.examRoom.description,
            startTime: examSession.startTime.toISOString(),
            endTime: examSession.endTime?.toISOString() || null,
            status: examSession.status,
            // Stats fields
            durationMinutes,
            totalQuestions,
            passingScore: examSession.passingScore,
            // Attempt info
            currentAttempt,
            maxAttempts,
            // Progress
            progress,
            // Question selection config
            questionCount: examSession.questionCount,
            questionSelectionMode: examSession.questionSelectionMode,
            shuffleQuestions: examSession.shuffleQuestions,
        };
    }

    /**
     * Available labels and their question counts, for configuring the question selection of a session.
     * Read from the session's own snapshot when `sessionId` is given (so the numbers match what the
     * session can actually draw), otherwise from a fresh snapshot of the room's quiz set.
     */
    async getAvailableLabelsForExamRoom(
        examRoomId: string,
        user: AuthUser,
        metadata: Metadata,
        sessionId?: string
    ) {
        const examRoom = await this.prisma.examRoom.findUnique({
            where: { id: examRoomId },
            select: { hostId: true, quizSetId: true, sourceDeleted: true },
        });

        if (!examRoom) {
            throw new NotFoundException('Phòng thi không tồn tại');
        }

        if (examRoom.hostId !== user.id) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        if (sessionId) {
            const session = await this.prisma.examSession.findFirst({
                where: { id: sessionId, examRoomId },
                select: { quizSnapshotHash: true },
            });
            if (!session) {
                throw new NotFoundException('Phiên thi không tồn tại');
            }
            return labelStats(await this.snapshots.load(sessionId, session.quizSnapshotHash));
        }

        if (examRoom.sourceDeleted) {
            throw new QuizSetDeletedException();
        }
        return labelStats(await this.snapshotTaker.take(examRoom.quizSetId, metadata));
    }

    /**
     * Re-take the snapshot from the quiz set, while that is still safe: the session has not started
     * and nobody has attempted it. The content call happens first (no lock held across a network
     * call); then one transaction locks the session row, re-checks status and attempts, and swaps the
     * snapshot. Attempt start takes the same lock, so a started attempt never sits next to a changed
     * snapshot: the loser of the race gets `409 SNAPSHOT_LOCKED` (refresh) or the new snapshot (start).
     */
    async refreshSnapshot(id: string, user: AuthUser, metadata: Metadata) {
        const session = await this.prisma.examSession.findUnique({
            where: { id },
            select: { id: true, examRoomId: true, examRoom: { select: { hostId: true, quizSetId: true, sourceDeleted: true } } },
        });
        if (!session || session.examRoom.hostId !== user.id) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }
        if (session.examRoom.sourceDeleted) {
            throw new QuizSetDeletedException();
        }

        const snapshot = await this.snapshotTaker.take(session.examRoom.quizSetId, metadata);
        await this.prisma.$transaction(async (tx) => {
            const locked = await lockSessionRow(tx, id);
            if (!locked) throw new NotFoundException('Phiên thi không tồn tại');
            const attemptCount = await tx.examAttempt.count({ where: { examSessionId: id } });
            if (!canRefresh({ status: locked.status, attemptCount }, session.examRoom.sourceDeleted)) {
                throw new SnapshotLockedException();
            }
            const config = await tx.examSession.findUniqueOrThrow({
                where: { id },
                select: { questionSelectionMode: true, questionCount: true, labelQuestionConfig: true },
            });
            // The stored selection must still be drawable from the new content.
            validateSelectionConfig(snapshot, {
                mode: config.questionSelectionMode,
                questionCount: config.questionCount,
                labelConfig: config.labelQuestionConfig as LabelQuestionConfig[] | null,
            });
            await tx.examSession.update({ where: { id }, data: snapshotColumns(snapshot) });
        });

        await this.examSessionRepository.invalidateItemCache(user.id, id);
        await this.examSessionRepository.invalidateUserListCache(user.id);
        await this.invalidateRoomCache(user.id, session.examRoomId);
        return { quizSnapshotHash: snapshot.contentHash };
    }
}
