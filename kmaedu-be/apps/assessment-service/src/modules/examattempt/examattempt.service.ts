import { PrismaService } from '../../prisma';
import { rethrowKnown } from '../common/rethrow-known';
import {
    Injectable,
    Logger,
    NotFoundException,
    InternalServerErrorException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { GenerateIdService, CryptoService } from '@kmaedu/common';
import {
    EXAM_SESSION_STATUS,
    EXAM_ATTEMPT_STATUS,
    ASSESS_TYPE,
    LabelQuestionConfig,
} from '../../types';
import { CreateExamAttemptDto } from './dto/create-examattempt.dto';
import { GetExamAttemptsDto } from './dto/get-examattempt.dto';
import { UpdateExamAttemptDto } from './dto/update-examattempt.dto';
import { ExamAttemptRepository } from './examattempt.repository';
import { ExamSessionRepository } from '../examsession/examsession.repository';
import type { Metadata } from '@grpc/grpc-js';
import { RedisService, EXPIRED_TIME } from '@kmaedu/redis';
import { DocumentClient } from '@kmaedu/grpc';
import { hasPermission, type AuthUser } from '@kmaedu/auth-jwt';
import { verifyAccessCodeOrThrow } from '../common/access-code-guard';
import { appendCodeGranted } from '../common/code-granted';
import { canSeeAnswers, toAttemptView } from './examattempt-view.mapper';
import { UserEnricher } from '../user-profile/user-enricher.service';
import { ContentClient } from '../../clients/content.client';
import { toQuizSetBrief } from '../examroom/quiz-set-titles.cache';
import { lockSessionRow } from '../snapshot/session-lock';
import {
    countCorrect,
    questionsOf,
    selectQuestionIds,
    withAnswer,
    withoutAnswer,
} from '../snapshot/snapshot.reader';
import { SnapshotStore } from '../snapshot/snapshot.store';
import type { QuizSnapshotV1 } from '../snapshot/quiz-snapshot';
import { ASSESSMENT_KEY_NAMESPACE } from '../../config/assessment.constants';
import {
    attemptRelation,
    type AttemptRelation,
} from './examattempt-access';

/** `null` = the owning service could not answer. */
interface HistoryStats {
    totalPDFs: number | null;
    examsCreated: number | null;
    flashcardSets: number | null;
    totalStudyHours: number;
}

@Injectable()
export class ExamAttemptService {
    private readonly logger = new Logger(ExamAttemptService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly examAttemptRepository: ExamAttemptRepository,
        private readonly examSessionRepository: ExamSessionRepository,
        private readonly generateIdService: GenerateIdService,
        private readonly redisService: RedisService,
        private readonly cryptoService: CryptoService,
        private readonly users: UserEnricher,
        private readonly documents: DocumentClient,
        private readonly content: ContentClient,
        private readonly snapshots: SnapshotStore
    ) {}

    /** The snapshot of the attempt's session (in-process LRU keyed by session and hash). */
    private snapshotOf(attempt: { examSessionId: string; examSession: { quizSnapshotHash: string } }) {
        return this.snapshots.load(attempt.examSessionId, attempt.examSession.quizSnapshotHash);
    }

    /**
     * Enforce exam-session access control before an attempt is created: a
     * guessed or leaked examSessionId must not let a non-participant into a
     * private, whitelisted or code-gated session. The room host is NOT a
     * participant here (hosts manage, they do not take). The code goes through
     * the shared lockout + constant-time check.
     */
    private async assertSessionAccess(
        examSession: any,
        user: AuthUser,
        providedCode?: string
    ): Promise<void> {
        // Public sessions are open to any student.
        if (examSession.assessType === ASSESS_TYPE.PUBLIC) {
            return;
        }

        // Whitelisted participants have access.
        if (
            Array.isArray(examSession.whitelist) &&
            examSession.whitelist.includes(user.id)
        ) {
            return;
        }

        // Unlocked the current code earlier: no second prompt until the code changes.
        if (
            Array.isArray(examSession.codeGrantedIds) &&
            examSession.codeGrantedIds.includes(user.id)
        ) {
            return;
        }

        // Code-gated sessions require the correct access code at start time.
        if (examSession.accessCode) {
            if (typeof providedCode !== 'string') {
                throw new ForbiddenException(
                    'Yêu cầu mã truy cập hợp lệ để bắt đầu làm bài'
                );
            }
            await verifyAccessCodeOrThrow(this.redisService.getClient(), {
                resourceId: examSession.id,
                userId: user.id,
                stored: examSession.accessCode.toString(),
                given: providedCode,
            });
            await appendCodeGranted(
                this.prisma,
                examSession.id,
                user.id,
                providedCode
            );
            return;
        }

        // Private with no code and not whitelisted → denied.
        throw new ForbiddenException(
            'Bạn không có quyền truy cập phiên thi này'
        );
    }

    /** What this viewer's token lets them do on attempts (permissions, never an owner's record). */
    private capabilities(user: AuthUser) {
        return {
            canTake: hasPermission(user.roles, 'exam:take'),
            canViewResults: hasPermission(user.roles, 'exam_result:view'),
            canManageSessions: hasPermission(user.roles, 'exam_session:manage'),
        };
    }

    /** 404 unless the viewer is the examinee or the host (no existence leak). */
    private relationOrNotFound(
        attempt: { userId: string; examSession: { examRoom: { hostId: string } } },
        user: AuthUser,
        mode: 'read' | 'write'
    ): AttemptRelation {
        const relation = attemptRelation(attempt, user.id, mode, this.capabilities(user));
        if (!relation) throw new NotFoundException('Bài làm không tồn tại');
        return relation;
    }

    /**
     * Start a new exam attempt or resume existing one
     * Checks retry limits based on ExamSession settings
     */
    async startExamAttempt(user: AuthUser, dto: CreateExamAttemptDto) {
        // The session, without its snapshot (that column is read only under the lock below).
        const examSession = await this.prisma.examSession.findUnique({
            where: { id: dto.examSessionId },
        });

        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        // Check if exam has started
        if (new Date(examSession.startTime) > new Date()) {
            throw new BadRequestException('Phiên thi chưa bắt đầu');
        }

        if (examSession.endTime && new Date(examSession.endTime) < new Date()) {
            throw new BadRequestException('Phiên thi đã kết thúc');
        }

        // Check for existing IN_PROGRESS attempt
        const existingInProgress = await this.prisma.examAttempt.findFirst({
            where: {
                examSessionId: dto.examSessionId,
                userId: user.id,
                status: EXAM_ATTEMPT_STATUS.IN_PROGRESS,
            },
        });

        if (existingInProgress) {
            // Resume existing attempt. An owned in-progress attempt already
            // proves prior legitimate access, so don't re-challenge the code
            // here — resuming from a new tab / the dashboard "Tiếp tục" button
            // has no access code in hand.
            return {
                message: 'Tiếp tục làm bài',
                examAttempt: existingInProgress,
                isResume: true,
            };
        }

        // Access control: block non-participants from private / whitelisted /
        // code-gated sessions before a NEW attempt row is created. (Resume above
        // is already gated by ownership of the in-progress attempt.)
        await this.assertSessionAccess(examSession, user, dto.accessCode);

        // Count completed attempts
        const completedAttempts = await this.prisma.examAttempt.count({
            where: {
                examSessionId: dto.examSessionId,
                userId: user.id,
                status: EXAM_ATTEMPT_STATUS.COMPLETED,
            },
        });

        // Check retry limits (based on ExamSession, not ExamRoom)
        // maxAttempts means the number of RETRIES allowed (not including first attempt)
        // So total allowed attempts = 1 (first) + maxAttempts (retries)
        const totalAllowedAttempts = 1 + examSession.maxAttempts;

        if (!examSession.allowRetake && completedAttempts > 0) {
            throw new BadRequestException(
                'Bạn đã làm bài này rồi và không được phép làm lại'
            );
        }

        if (completedAttempts >= totalAllowedAttempts) {
            throw new BadRequestException(
                `Bạn đã đạt số lần thi tối đa (${totalAllowedAttempts} lần)`
            );
        }

        try {
            const { attempt, isResume } = await this.createAttemptUnderLock(user.id, examSession);
            await this.examAttemptRepository.invalidateUserListCache(user.id);
            await this.examAttemptRepository.invalidateItemCache(user.id, attempt.id);

            return {
                message: isResume ? 'Tiếp tục làm bài' : 'Bắt đầu làm bài thành công',
                examAttempt: attempt,
                isResume,
            };
        } catch (error) {
            rethrowKnown(error);
            throw new InternalServerErrorException('Bắt đầu làm bài thất bại');
        }
    }

    /**
     * Creates the attempt in a transaction that first locks the session row: `refresh-snapshot`
     * takes the same lock, so the snapshot read here is the one that stays (a refresh that comes
     * after sees this attempt and answers 409; one that came first is already in the row). Questions
     * are drawn from that snapshot only. A second start of the same user that queued behind the lock
     * resumes the attempt the first one created.
     */
    private async createAttemptUnderLock(
        userId: string,
        examSession: {
            id: string;
            questionSelectionMode: number;
            questionCount: number | null;
            labelQuestionConfig: unknown;
            shuffleQuestions: boolean;
        }
    ) {
        return this.prisma.$transaction(async (tx) => {
            await lockSessionRow(tx, examSession.id);
            const concurrent = await tx.examAttempt.findFirst({
                where: { examSessionId: examSession.id, userId, status: EXAM_ATTEMPT_STATUS.IN_PROGRESS },
            });
            if (concurrent) return { attempt: concurrent, isResume: true };

            const current = await tx.examSession.findUniqueOrThrow({
                where: { id: examSession.id },
                select: { quizSnapshotHash: true },
            });
            const snapshot = await this.snapshots.load(examSession.id, current.quizSnapshotHash, tx);
            const selectedQuestionIds = selectQuestionIds(snapshot, {
                mode: examSession.questionSelectionMode,
                questionCount: examSession.questionCount,
                labelConfig: examSession.labelQuestionConfig as LabelQuestionConfig[] | null,
                shuffle: examSession.shuffleQuestions,
            });
            const attempt = await tx.examAttempt.create({
                data: {
                    id: this.generateIdService.generateId(),
                    examSessionId: examSession.id,
                    userId,
                    score: 0,
                    violationCount: 0,
                    startedAt: new Date(),
                    status: EXAM_ATTEMPT_STATUS.IN_PROGRESS,
                    answers: {},
                    currentIndex: 0,
                    markedQuestions: [],
                    totalQuestions: selectedQuestionIds.length,
                    correctAnswers: 0,
                    selectedQuestionIds,
                },
            });
            return { attempt, isResume: false };
        });
    }

    /**
     * Update exam attempt progress (auto-save)
     */
    async updateExamAttemptProgress(
        attemptId: string,
        user: AuthUser,
        dto: {
            answers?: Record<string, string>;
            currentIndex?: number;
            markedQuestions?: string[];
        }
    ) {
        // Verify ownership and status
        const attempt = await this.prisma.examAttempt.findFirst({
            where: { id: attemptId, userId: user.id },
        });

        if (!attempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        if (attempt.status !== EXAM_ATTEMPT_STATUS.IN_PROGRESS) {
            throw new BadRequestException('Bài làm đã nộp, không thể cập nhật');
        }

        try {
            const updateData: any = {};

            if (dto.answers !== undefined) {
                updateData.answers = dto.answers;
            }
            if (dto.currentIndex !== undefined) {
                updateData.currentIndex = dto.currentIndex;
            }
            if (dto.markedQuestions !== undefined) {
                updateData.markedQuestions = dto.markedQuestions;
            }

            const updatedAttempt = await this.prisma.examAttempt.update({
                where: { id: attemptId },
                data: updateData,
            });
            await this.examAttemptRepository.invalidateItemCache(user.id, attemptId);

            return {
                message: 'Cập nhật bài làm thành công',
                examAttempt: updatedAttempt,
            };
        } catch (error) {
            rethrowKnown(error);
            throw new InternalServerErrorException('Cập nhật bài làm thất bại');
        }
    }

    /**
     * Submit exam attempt - calculate score
     * Returns detailed answers based on showAnswersAfterSubmit setting
     */
    async submitExamAttempt(attemptId: string, user: AuthUser) {
        const attempt = await this.prisma.examAttempt.findFirst({
            where: { id: attemptId, userId: user.id },
            include: { examSession: true },
        });

        if (!attempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        if (attempt.status !== EXAM_ATTEMPT_STATUS.IN_PROGRESS) {
            throw new BadRequestException('Bài làm đã được nộp trước đó');
        }

        // Graded against the snapshot the attempt was drawn from: later edits of the quiz set never count.
        const snapshot = await this.snapshotOf(attempt);
        const questions = questionsOf(snapshot, attempt.selectedQuestionIds);
        const correctCount = countCorrect(questions, attempt.answers as Record<string, string>);

        const totalQuestions = questions.length;
        const score =
            totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

        try {
            const updatedAttempt = await this.prisma.examAttempt.update({
                where: { id: attemptId },
                data: {
                    status: EXAM_ATTEMPT_STATUS.COMPLETED,
                    finishedAt: new Date(),
                    score,
                    correctAnswers: correctCount,
                    totalQuestions,
                },
            });

            const showAnswers = attempt.examSession.showAnswersAfterSubmit;
            const passingScore = attempt.examSession.passingScore || 0;
            const passed = score >= passingScore;

            await this.examAttemptRepository.invalidateUserListCache(user.id);
            await this.examAttemptRepository.invalidateItemCache(user.id, attemptId);

            const summary = {
                message: 'Nộp bài thành công',
                examAttempt: updatedAttempt,
                score,
                totalQuestions,
                correctAnswers: correctCount,
                percentage: Math.round(score * 10) / 10,
                passed,
                passingScore,
            };
            // The answer key only after submit, and only when the session allows it.
            return showAnswers
                ? { ...summary, showAnswers: true, questions: questions.map(withAnswer) }
                : { ...summary, showAnswers: false };
        } catch (error) {
            rethrowKnown(error);
            throw new InternalServerErrorException('Nộp bài thất bại');
        }
    }

    /**
     * Get exam attempt with questions for quiz
     * Answers are stripped for students (only included for owners or after submit if allowed)
     */
    async getExamAttemptForQuiz(attemptId: string, user: AuthUser) {
        const attempt = await this.prisma.examAttempt.findFirst({
            where: { id: attemptId, userId: user.id },
            include: { examSession: { include: { examRoom: true } } },
        });

        if (!attempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        const isOwner = attempt.examSession.examRoom.hostId === user.id;
        const showAnswers =
            attempt.status === EXAM_ATTEMPT_STATUS.COMPLETED &&
            attempt.examSession.showAnswersAfterSubmit;

        const snapshot = await this.snapshotOf(attempt);
        const questions = questionsOf(snapshot, attempt.selectedQuestionIds).map(
            isOwner || showAnswers ? withAnswer : withoutAnswer
        );

        // Calculate time limit from session
        let timeLimitMinutes: number | null = null;
        if (attempt.examSession.endTime) {
            const diffMs =
                attempt.examSession.endTime.getTime() -
                attempt.examSession.startTime.getTime();
            timeLimitMinutes = Math.floor(diffMs / 60000);
        }

        // The host's display data lives in auth: one batched lookup.
        const examRoom = await this.users.withHost(attempt.examSession.examRoom);

        // Picked by name (never `...attempt`): no accessCode / whitelist, no answer key outside `questions`.
        return {
            ...toAttemptView(attempt, isOwner ? 'host' : 'examinee'),
            questions,
            timeLimitMinutes,
            creator: examRoom.host,
            isOwner,
        };
    }

    /**
     * Get all exam attempts for an exam room with user and session details
     * For displaying in the participants/attempts tab
     * Optimized with single query and proper joins
     */
    async getExamAttemptsByRoom(
        examRoomId: string,
        user: AuthUser,
        page: number = 1,
        limit: number = 10,
        distinctUser: boolean = false
    ) {
        // First verify user owns this exam room
        const examRoom = await this.prisma.examRoom.findUnique({
            where: { id: examRoomId },
            select: { hostId: true },
        });

        if (!examRoom) {
            throw new NotFoundException('Phòng thi không tồn tại');
        }

        if (examRoom.hostId !== user.id) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        const skip = (page - 1) * limit;

        // If distinctUser is true, get only the latest attempt per user
        if (distinctUser) {
            const distinctWhere = {
                examSession: {
                    examRoomId: examRoomId,
                },
            };

            // Let the DB pick the latest attempt per user (distinct + orderBy)
            // and page directly over the distinct groups, instead of loading
            // every attempt in the room into memory to dedup/slice in JS.
            const [pagedRows, distinctUserGroups] = await Promise.all([
                this.prisma.examAttempt.findMany({
                    where: distinctWhere,
                    distinct: ['userId'],
                    include: {
                        examSession: {
                            select: {
                                id: true,
                                startTime: true,
                                endTime: true,
                            },
                        },
                    },
                    orderBy: { startedAt: 'desc' },
                    skip,
                    take: limit,
                }),
                // COUNT(DISTINCT userId) equivalent for the total, without
                // fetching/joining every row.
                this.prisma.examAttempt.groupBy({
                    by: ['userId'],
                    where: distinctWhere,
                }),
            ]);

            // Examinee display data lives in auth: one batched lookup per page.
            const paginatedAttempts = await this.users.withUsers(pagedRows);
            const total = distinctUserGroups.length;

            // Transform data
            const transformedAttempts = paginatedAttempts.map((attempt) => {
                let timeSpentSeconds = 0;
                if (attempt.finishedAt && attempt.startedAt) {
                    timeSpentSeconds = Math.floor(
                        (new Date(attempt.finishedAt).getTime() -
                            new Date(attempt.startedAt).getTime()) /
                            1000
                    );
                } else if (attempt.startedAt) {
                    timeSpentSeconds = Math.floor(
                        (Date.now() - new Date(attempt.startedAt).getTime()) /
                            1000
                    );
                }

                return {
                    id: attempt.id,
                    status: attempt.status,
                    score: attempt.score,
                    totalQuestions: attempt.totalQuestions,
                    correctAnswers: attempt.correctAnswers,
                    startedAt: attempt.startedAt,
                    finishedAt: attempt.finishedAt,
                    timeSpentSeconds,
                    answers: attempt.answers,
                    user: attempt.user,
                    session: {
                        id: attempt.examSession.id,
                        startTime: attempt.examSession.startTime,
                        endTime: attempt.examSession.endTime,
                    },
                };
            });

            return {
                attempts: transformedAttempts,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        }

        // Get attempts with user and session info in single query
        const [attemptRows, total] = await Promise.all([
            this.prisma.examAttempt.findMany({
                where: {
                    examSession: {
                        examRoomId: examRoomId,
                    },
                },
                include: {
                    examSession: {
                        select: {
                            id: true,
                            startTime: true,
                            endTime: true,
                        },
                    },
                },
                orderBy: { startedAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.examAttempt.count({
                where: {
                    examSession: {
                        examRoomId: examRoomId,
                    },
                },
            }),
        ]);

        const attempts = await this.users.withUsers(attemptRows);

        // Transform data for frontend - O(n) single pass
        const transformedAttempts = attempts.map((attempt) => {
            // Calculate time spent (in seconds)
            let timeSpentSeconds = 0;
            if (attempt.finishedAt && attempt.startedAt) {
                timeSpentSeconds = Math.floor(
                    (new Date(attempt.finishedAt).getTime() -
                        new Date(attempt.startedAt).getTime()) /
                        1000
                );
            } else if (attempt.startedAt) {
                // Still in progress - calc from now
                timeSpentSeconds = Math.floor(
                    (Date.now() - new Date(attempt.startedAt).getTime()) / 1000
                );
            }

            return {
                id: attempt.id,
                status: attempt.status,
                score: attempt.score,
                totalQuestions: attempt.totalQuestions,
                correctAnswers: attempt.correctAnswers,
                startedAt: attempt.startedAt,
                finishedAt: attempt.finishedAt,
                timeSpentSeconds,
                answers: attempt.answers,
                user: attempt.user,
                session: {
                    id: attempt.examSession.id,
                    startTime: attempt.examSession.startTime,
                    endTime: attempt.examSession.endTime,
                },
            };
        });

        return {
            attempts: transformedAttempts,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Get single exam attempt details by ID
     * For displaying in detail slider
     */
    async getExamAttemptDetailForSlider(attemptId: string, user: AuthUser) {
        const attempt = await this.prisma.examAttempt.findUnique({
            where: { id: attemptId },
            include: { examSession: { include: { examRoom: true } } },
        });

        if (!attempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        // Only the examinee or the room host can see attempt details (404 otherwise)
        const relation = this.relationOrNotFound(attempt, user, 'read');
        const examinee = (await this.users.withUser(attempt)).user;

        // Calculate time spent
        let timeSpentSeconds = 0;
        if (attempt.finishedAt && attempt.startedAt) {
            timeSpentSeconds = Math.floor(
                (new Date(attempt.finishedAt).getTime() -
                    new Date(attempt.startedAt).getTime()) /
                    1000
            );
        }

        // The viewer is the examinee or the host (checked above): show the
        // questions, with answers only once the attempt is completed.
        const showAnswers =
            attempt.status === EXAM_ATTEMPT_STATUS.COMPLETED &&
            canSeeAnswers(
                relation,
                attempt.status,
                attempt.examSession.showAnswersAfterSubmit
            );
        const attemptAnswers = (attempt.answers as Record<string, string>) || {};
        // The questions this attempt was drawn from the session's snapshot, answers keyed by question id.
        const snapshot = await this.snapshotOf(attempt);
        const questions = questionsOf(snapshot, attempt.selectedQuestionIds).map((q) => ({
            id: q.id,
            question: q.question,
            options: q.options,
            ...(showAnswers ? { answer: q.answer } : {}),
            userAnswer: attemptAnswers[q.id] ?? null,
        }));

        return {
            id: attempt.id,
            status: attempt.status,
            score: attempt.score,
            totalQuestions: attempt.totalQuestions,
            correctAnswers: attempt.correctAnswers,
            startedAt: attempt.startedAt,
            finishedAt: attempt.finishedAt,
            timeSpentSeconds,
            answers: attempt.answers,
            currentIndex: attempt.currentIndex,
            markedQuestions: attempt.markedQuestions,
            violationCount: attempt.violationCount,
            user: examinee,
            passingScore: attempt.examSession.passingScore ?? 0,
            questions,
            examAttempt: {
                id: attempt.id,
                answers: attempt.answers || {},
                timeSpentSeconds,
                score: attempt.score,
                status: attempt.status,
                startedAt: attempt.startedAt,
                finishedAt: attempt.finishedAt,
            },
            session: {
                id: attempt.examSession.id,
                startTime: attempt.examSession.startTime,
                endTime: attempt.examSession.endTime,
            },
            examRoom: {
                id: attempt.examSession.examRoom.id,
                title: attempt.examSession.examRoom.title,
            },
        };
    }

    /**
     * Get all exam attempts for a specific session (owner only)
     * Includes violationCount for cheating detection display
     */
    async getExamAttemptsBySession(
        sessionId: string,
        user: AuthUser,
        page: number = 1,
        limit: number = 50,
        distinctUser: boolean = false
    ) {
        // First verify user owns this session's exam room
        const session = await this.prisma.examSession.findUnique({
            where: { id: sessionId },
            include: {
                examRoom: {
                    select: { hostId: true },
                },
            },
        });

        if (!session) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        if (session.examRoom.hostId !== user.id) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        const skip = (page - 1) * limit;

        // If distinctUser is true, get only the best attempt per user
        // BUT aggregate violation counts from ALL attempts
        if (distinctUser) {
            const baseWhere = { examSessionId: sessionId };

            // Page over users directly: groupBy computes the per-user
            // violationCount sum + attempt count + best score in SQL, and
            // orderBy/skip/take page the *users* (not the raw attempt rows).
            const [userAggregates, allUserGroups] = await Promise.all([
                this.prisma.examAttempt.groupBy({
                    by: ['userId'],
                    where: baseWhere,
                    _sum: { violationCount: true },
                    _count: { _all: true },
                    _max: { score: true },
                    orderBy: { _max: { score: 'desc' } },
                    skip,
                    take: limit,
                }),
                // COUNT(DISTINCT userId) equivalent for the total.
                this.prisma.examAttempt.groupBy({
                    by: ['userId'],
                    where: baseWhere,
                }),
            ]);

            const total = allUserGroups.length;
            const pagedUserIds = userAggregates.map((g) => g.userId);

            // Fetch the representative (best score) attempt per paged user in
            // a single bounded query instead of loading the whole session.
            const candidateRows = pagedUserIds.length
                ? await this.prisma.examAttempt.findMany({
                      where: {
                          examSessionId: sessionId,
                          userId: { in: pagedUserIds },
                      },
                      include: {
                          examSession: {
                              select: {
                                  id: true,
                                  startTime: true,
                                  endTime: true,
                              },
                          },
                      },
                      orderBy: { score: 'desc' },
                  })
                : [];
            const candidateAttempts = await this.users.withUsers(candidateRows);

            // First occurrence per userId in a score-desc list is the best
            // attempt for that user - same tie-breaking semantics as before.
            const bestAttemptByUser = new Map<
                string,
                (typeof candidateAttempts)[0]
            >();
            for (const attempt of candidateAttempts) {
                if (!bestAttemptByUser.has(attempt.userId)) {
                    bestAttemptByUser.set(attempt.userId, attempt);
                }
            }

            const aggregateByUser = new Map(
                userAggregates.map((g) => [g.userId, g])
            );

            // Transform data with aggregated violation count, preserving the
            // best-score-desc user order produced by the groupBy above.
            const transformedAttempts = pagedUserIds
                .map((userId) => {
                    const attempt = bestAttemptByUser.get(userId);
                    const agg = aggregateByUser.get(userId);
                    if (!attempt || !agg) {
                        return null;
                    }

                    let timeSpentSeconds = 0;
                    if (attempt.finishedAt && attempt.startedAt) {
                        timeSpentSeconds = Math.floor(
                            (new Date(attempt.finishedAt).getTime() -
                                new Date(attempt.startedAt).getTime()) /
                                1000
                        );
                    }

                    return {
                        id: attempt.id,
                        status: attempt.status,
                        score: attempt.score,
                        totalQuestions: attempt.totalQuestions,
                        correctAnswers: attempt.correctAnswers,
                        startedAt: attempt.startedAt,
                        finishedAt: attempt.finishedAt,
                        timeSpentSeconds,
                        // Return AGGREGATED violation count from all attempts
                        violationCount: agg._sum.violationCount ?? 0,
                        // Return count of attempts for this user
                        attemptCount: agg._count._all,
                        answers: attempt.answers,
                        user: attempt.user,
                        session: {
                            id: attempt.examSession.id,
                            startTime: attempt.examSession.startTime,
                            endTime: attempt.examSession.endTime,
                        },
                    };
                })
                .filter(
                    (item): item is NonNullable<typeof item> => item !== null
                );

            return {
                attempts: transformedAttempts,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        }

        // Get attempts with user info and violation count
        const [attemptRows, total] = await Promise.all([
            this.prisma.examAttempt.findMany({
                where: { examSessionId: sessionId },
                include: {
                    examSession: {
                        select: {
                            id: true,
                            startTime: true,
                            endTime: true,
                        },
                    },
                },
                orderBy: { score: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.examAttempt.count({
                where: { examSessionId: sessionId },
            }),
        ]);

        const attempts = await this.users.withUsers(attemptRows);

        // Transform - O(n)
        const transformedAttempts = attempts.map((attempt) => {
            let timeSpentSeconds = 0;
            if (attempt.finishedAt && attempt.startedAt) {
                timeSpentSeconds = Math.floor(
                    (new Date(attempt.finishedAt).getTime() -
                        new Date(attempt.startedAt).getTime()) /
                        1000
                );
            }

            return {
                id: attempt.id,
                status: attempt.status,
                score: attempt.score,
                totalQuestions: attempt.totalQuestions,
                correctAnswers: attempt.correctAnswers,
                startedAt: attempt.startedAt,
                finishedAt: attempt.finishedAt,
                timeSpentSeconds,
                violationCount: attempt.violationCount,
                answers: attempt.answers,
                user: attempt.user,
                session: {
                    id: attempt.examSession.id,
                    startTime: attempt.examSession.startTime,
                    endTime: attempt.examSession.endTime,
                },
            };
        });

        return {
            attempts: transformedAttempts,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    // ==================== EXISTING METHODS ====================

    async createExamAttempt(user: AuthUser, dto: CreateExamAttemptDto) {
        // Verify exam session exists
        const examSession = await this.examSessionRepository.findOne({
            where: { id: dto.examSessionId },
            include: {
                examRoom: true,
            },
            cache: true,
        });

        if (!examSession) {
            throw new NotFoundException('Phiên thi không tồn tại');
        }

        // Access control: block non-participants from private / whitelisted /
        // code-gated sessions before any attempt row is created.
        await this.assertSessionAccess(examSession, user, dto.accessCode);

        // Check if exam has started
        if ((examSession as any).status === EXAM_SESSION_STATUS.UPCOMING) {
            throw new BadRequestException('Phiên thi chưa bắt đầu');
        }

        if ((examSession as any).status === EXAM_SESSION_STATUS.ENDED) {
            throw new BadRequestException('Phiên thi đã kết thúc');
        }

        // Check if user has reached max attempts - use a COUNT query instead
        // of loading every prior attempt row just to read its length.
        const attemptCount = await this.examAttemptRepository.countUserAttempts(
            user.id,
            dto.examSessionId
        );

        // Use ExamSession settings for retry check
        if (!(examSession as any).allowRetake && attemptCount > 0) {
            throw new BadRequestException('Bạn đã hết lượt thi');
        }

        if (attemptCount >= (examSession as any).maxAttempts) {
            throw new BadRequestException(
                `Bạn đã đạt số lần thi tối đa (${(examSession as any).maxAttempts})`
            );
        }

        try {
            // Same row lock as `startExamAttempt`: an attempt never appears next to a refreshed snapshot.
            const newExamAttempt = await this.prisma.$transaction(async (tx) => {
                await lockSessionRow(tx, dto.examSessionId);
                return tx.examAttempt.create({
                    data: {
                        id: this.generateIdService.generateId(),
                        examSessionId: dto.examSessionId,
                        userId: user.id,
                        score: 0,
                        violationCount: 0,
                        startedAt: new Date(),
                        status: EXAM_ATTEMPT_STATUS.IN_PROGRESS,
                    },
                });
            });
            await this.examAttemptRepository.invalidateUserListCache(user.id);
            await this.examAttemptRepository.invalidateItemCache(user.id, newExamAttempt.id);

            // Load relations for response
            const examAttemptWithRelations =
                await this.examAttemptRepository.findOne({
                    where: { id: newExamAttempt.id },
                    include: { examSession: { include: { examRoom: true } } },
                    cache: false,
                });

            return {
                message: 'Bắt đầu làm bài thành công',
                examAttempt: toAttemptView(
                    (await this.users.withUser(
                        examAttemptWithRelations as any
                    )) as any,
                    'examinee'
                ),
            };
        } catch (error) {
            rethrowKnown(error);
            throw new InternalServerErrorException('Bắt đầu làm bài thất bại');
        }
    }

    async getExamAttemptById(id: string, user: AuthUser) {
        const examAttempt = await this.examAttemptRepository.findOne({
            where: { id },
            include: { examSession: { include: { examRoom: true } } },
            cache: true,
        });

        if (!examAttempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        // The examinee sees their own attempt, the host sees all attempts (404 otherwise)
        const relation = this.relationOrNotFound(examAttempt as any, user, 'read');

        // The attempt's questions come from its session's snapshot, not from the live quiz set.
        const snapshot = await this.snapshotOf(examAttempt as any);
        const questions = questionsOf(snapshot, examAttempt.selectedQuestionIds);

        // Picked by name: no sharing secrets, answers only when allowed (see the mapper)
        return toAttemptView(
            (await this.users.withUser(examAttempt as any)) as any,
            relation,
            questions
        );
    }

    async deleteExamAttempt(id: string, user: AuthUser) {
        const examAttempt = await this.examAttemptRepository.findOne({
            where: { id },
            include: {
                examSession: {
                    include: {
                        examRoom: true,
                    },
                },
            },
            cache: false,
        });

        if (!examAttempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        // Only host can delete attempts
        if ((examAttempt as any).examSession.examRoom.hostId !== user.id) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        // Hard delete - pass userId (host) for proper cache invalidation
        await this.examAttemptRepository.delete(id, user.id);
        return { message: 'Xóa bài làm thành công' };
    }

    async getExamAttempts(user: AuthUser, dto: GetExamAttemptsDto) {
        const where: any = {};

        // If examSessionId is provided, check if user is host or participant
        if (dto.examSessionId) {
            const examSession = await this.examSessionRepository.findOne({
                where: { id: dto.examSessionId },
                include: { examRoom: true },
                cache: true,
            });

            if (!examSession) {
                throw new NotFoundException('Phiên thi không tồn tại');
            }

            // Host can view all attempts, participants can only view their own
            if ((examSession as any).examRoom.hostId === user.id) {
                where.examSessionId = dto.examSessionId;
            } else {
                where.examSessionId = dto.examSessionId;
                where.userId = user.id;
            }
        } else {
            // If no examSessionId, only show user's own attempts
            where.userId = user.id;
        }

        if (dto.userId && dto.userId !== user.id) {
            // Only host can filter by other users - use Prisma directly for complex nested query
            const examSessions = await this.prisma.examSession.findMany({
                where: {
                    examRoom: {
                        hostId: user.id,
                    },
                },
                select: { id: true },
            });

            const sessionIds = examSessions.map((s) => s.id);
            where.examSessionId = { in: sessionIds };
            where.userId = dto.userId;
        }

        if (dto.status !== undefined) {
            where.status = dto.status;
        }

        const result = await this.examAttemptRepository.paginate(
            {
                page: dto.page || 1,
                size: dto.limit || 10,
                ...where,
                include: {
                    examSession: {
                        select: {
                            id: true,
                            startTime: true,
                            endTime: true,
                            examRoom: {
                                select: {
                                    id: true,
                                    title: true,
                                    quizSetId: true,
                                    quizSetTitle: true,
                                },
                            },
                        },
                    },
                },
                sortBy: 'startedAt',
                sortType: 'desc',
                cache: true,
            },
            user.id
        );

        const withUsers = await this.users.withUsers(result.data as Array<{ userId: string }>);
        return {
            examAttempts: withUsers.map((a) => {
                const session = (a as any).examSession;
                return {
                    ...a,
                    examSession: {
                        ...session,
                        examRoom: { ...session.examRoom, quizSet: toQuizSetBrief(session.examRoom) },
                    },
                };
            }),
            total: result.total,
            page: result.page,
            limit: result.size,
            totalPages: result.totalPages,
        };
    }

    async updateExamAttempt(id: string, user: AuthUser, dto: UpdateExamAttemptDto) {
        const examAttempt = await this.examAttemptRepository.findOne({
            where: { id },
            include: {
                examSession: {
                    include: {
                        examRoom: true,
                    },
                },
            },
            cache: false,
        });

        if (!examAttempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        // The examinee or the host (who may manage sessions) can update; 404 otherwise.
        const isHost =
            this.relationOrNotFound(examAttempt as any, user, 'write') === 'host';

        // score, status and violationCount reflect server-side grading and
        // cheating detection results. Only the exam-room host may set them;
        // a participant updating their own attempt must not be able to
        // self-award a score or erase their violation count.
        if (
            !isHost &&
            (dto.score !== undefined ||
                dto.status !== undefined ||
                dto.violationCount !== undefined)
        ) {
            throw new ForbiddenException(
                'Bạn không có quyền cập nhật điểm số, trạng thái hoặc số lần vi phạm của bài làm này'
            );
        }

        const updateData: any = {};

        if (isHost && dto.score !== undefined) {
            updateData.score = dto.score;
        }

        if (isHost && dto.violationCount !== undefined) {
            updateData.violationCount = dto.violationCount;
        }

        if (isHost && dto.status !== undefined) {
            updateData.status = dto.status;
            // If status is COMPLETED or CANCELLED, set finishedAt
            if (
                dto.status === EXAM_ATTEMPT_STATUS.COMPLETED ||
                dto.status === EXAM_ATTEMPT_STATUS.CANCELLED
            ) {
                updateData.finishedAt = new Date();
            }
        }

        try {
            await this.examAttemptRepository.update(id, updateData, user.id);

            // Load with relations for response
            const updatedExamAttempt = await this.examAttemptRepository.findOne(
                {
                    where: { id },
                    include: { examSession: { include: { examRoom: true } } },
                    cache: false,
                }
            );

            return {
                message: 'Cập nhật bài làm thành công',
                examAttempt: toAttemptView(
                    (await this.users.withUser(updatedExamAttempt as any)) as any,
                    isHost ? 'host' : 'examinee'
                ),
            };
        } catch (error) {
            rethrowKnown(error);
            if (error.code === 'P2025') {
                throw new NotFoundException('Bài làm không tồn tại');
            }
            throw new InternalServerErrorException('Cập nhật bài làm thất bại');
        }
    }

    /**
     * Aggregated history statistics for the caller: their own attempt time (this database), and the
     * counts other services own, asked in parallel as the caller (3 s each): content-service
     * (quiz sets / flashcard sets) and document-service (uploaded files). A service that cannot
     * answer leaves its field `null`, and such a result is never cached.
     */
    async getHistoryStats(user: AuthUser, metadata: Metadata) {
        const cacheKey = `${ASSESSMENT_KEY_NAMESPACE}cache:history-stats:${user.id}`;

        const cached = await this.redisService.get<HistoryStats>(cacheKey);
        if (cached) {
            return cached;
        }

        const [pdfCount, contentStats, durationResult] = await Promise.all([
            this.settle('document', async () => (await this.documents.getQuota(metadata)).fileCount),
            this.settle('content', () => this.content.getUserContentStats(metadata)),
            // Sum total time spent on exams directly in SQL instead of
            // loading every completed attempt's timestamps into memory.
            this.prisma.$queryRaw<{ totalSeconds: number | null }[]>`
                SELECT COALESCE(SUM(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt"))), 0) AS "totalSeconds"
                FROM "ExamAttempt"
                WHERE "userId" = ${user.id}
                    AND "status" = ${EXAM_ATTEMPT_STATUS.COMPLETED}
                    AND "finishedAt" IS NOT NULL
            `,
        ]);

        // Calculate total study hours from the summed duration (seconds -> hours)
        const totalSeconds = Number(durationResult[0]?.totalSeconds ?? 0);
        const stats: HistoryStats = {
            totalPDFs: pdfCount,
            examsCreated: contentStats?.quizSetCount ?? null,
            flashcardSets: contentStats?.flashcardSetCount ?? null,
            totalStudyHours: Math.round(totalSeconds / 3600),
        };

        // Cache for 5 minutes, except a result with a missing field (a service was down)
        if (pdfCount !== null && contentStats !== null) {
            await this.redisService.set(cacheKey, stats, EXPIRED_TIME.FIVE_MINUTES);
        }

        return stats;
    }

    /** `null` when `service` cannot answer in time: the dashboard shows 0 for that field and nothing is cached. */
    private async settle<T>(service: string, call: () => Promise<T>): Promise<T | null> {
        try {
            return await call();
        } catch (error) {
            this.logger.warn(`History stats without the ${service} count: ${(error as Error).message}`);
            return null;
        }
    }

    // ==================== SECURE QUIZ METHODS ====================

    /**
     * Get exam attempt with per-question JWT tokens
     * NEVER returns answer field - secure endpoint for quiz taking
     */
    async getSecureQuizQuestions(attemptId: string, user: AuthUser) {
        const attempt = await this.prisma.examAttempt.findFirst({
            where: { id: attemptId, userId: user.id },
            include: { examSession: true },
        });

        if (!attempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        // Calculate expiry time based on session end time
        const expirySeconds = this.cryptoService.calculateExpirySeconds(
            attempt.examSession.endTime
        );

        const snapshot = await this.snapshotOf(attempt);
        const questions = questionsOf(snapshot, attempt.selectedQuestionIds);

        // Generate secure questions with per-question JWT tokens.
        // Content is served as plaintext over TLS (auth-scoped to the attempt
        // owner, answers never included). The previous AES layer used a key
        // shipped in the client bundle, so it provided no real protection —
        // decryption is no longer done client-side. See security audit C5.
        const secureQuestions = questions.map((q, index) => {
            // Sign JWT token for this question
            const token = this.cryptoService.signQuestionToken(
                {
                    qid: q.id,
                    aid: attemptId,
                    uid: user.id,
                    i: index,
                    t: 'question',
                },
                expirySeconds
            );

            return {
                index,
                token,
                question: q.question,
                options: q.options,
            };
        });

        // Calculate time limit from session
        let timeLimitMinutes: number | null = null;
        if (attempt.examSession.endTime) {
            const diffMs =
                attempt.examSession.endTime.getTime() -
                attempt.examSession.startTime.getTime();
            timeLimitMinutes = Math.floor(diffMs / 60000);
        }

        // Return minimal data - no answers, no full question text exposed
        return {
            attemptId: attempt.id,
            status: attempt.status,
            currentIndex: attempt.currentIndex,
            answers: attempt.answers,
            markedQuestions: attempt.markedQuestions,
            totalQuestions: attempt.totalQuestions,
            timeLimitMinutes,
            startedAt: attempt.startedAt,
            questions: secureQuestions,
        };
    }

    /**
     * Submit exam attempt with JWT token verification
     * Each answer must have a valid JWT token matching the attempt
     */
    async submitSecureExamAttempt(
        attemptId: string,
        user: AuthUser,
        answers: Array<{ token: string; chosen_option: string }>
    ) {
        const attempt = await this.prisma.examAttempt.findFirst({
            where: { id: attemptId, userId: user.id },
            include: { examSession: true },
        });

        if (!attempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        if (attempt.status !== EXAM_ATTEMPT_STATUS.IN_PROGRESS) {
            throw new BadRequestException('Bài làm đã được nộp trước đó');
        }

        // The attempt's questions and answer letters, from the snapshot of its session.
        const snapshot: QuizSnapshotV1 = await this.snapshotOf(attempt);
        const questions = questionsOf(snapshot, attempt.selectedQuestionIds);
        const questionMap = new Map(questions.map((q) => [q.id, q]));

        // Verify tokens and calculate score
        let correctCount = 0;
        let invalidTokenCount = 0;
        const verifiedAnswers: Record<string, string> = {};

        for (const ans of answers) {
            try {
                // Verify JWT token
                const decoded = this.cryptoService.verifyQuestionToken(
                    ans.token
                );

                // Validate token belongs to this attempt and user
                if (decoded.aid !== attemptId) {
                    invalidTokenCount++;
                    continue;
                }
                if (decoded.uid !== user.id) {
                    invalidTokenCount++;
                    continue;
                }
                if (decoded.t !== 'question') {
                    invalidTokenCount++;
                    continue;
                }

                // Check question exists in this exam
                const question = questionMap.get(decoded.qid);
                if (!question) {
                    invalidTokenCount++;
                    continue;
                }

                // Store verified answer
                verifiedAnswers[decoded.qid] = ans.chosen_option;

                // Check if correct
                if (question.answer === ans.chosen_option) {
                    correctCount++;
                }
            } catch (error) {
                // Token verification failed
                invalidTokenCount++;
            }
        }

        // Log violations if invalid tokens found
        if (invalidTokenCount > 0) {
            console.warn(
                `[SECURITY] Attempt ${attemptId}: ${invalidTokenCount} invalid tokens detected`
            );
        }

        // If the client sent answers but NONE passed token verification, the
        // question tokens are stale/invalid wholesale (e.g. signed before a
        // QUIZ_JWT_SECRET rotation/restart, or expired). Do NOT overwrite the
        // saved progress with an empty result and mark the attempt done — that
        // silently wipes the user's work and shows a confusing 0/N "chưa trả
        // lời". Reject instead so the attempt stays IN_PROGRESS; reloading the
        // page issues fresh tokens and restores the auto-saved answers for
        // resubmission. (A genuinely empty submission sends no answers, so it
        // is unaffected.)
        if (answers.length > 0 && Object.keys(verifiedAnswers).length === 0) {
            throw new BadRequestException(
                'Phiên làm bài không hợp lệ hoặc đã hết hạn. Vui lòng tải lại trang rồi nộp lại — câu trả lời của bạn vẫn được lưu.'
            );
        }

        const totalQuestions = questionMap.size;
        const score =
            totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

        try {
            const updatedAttempt = await this.prisma.examAttempt.update({
                where: { id: attemptId },
                data: {
                    status: EXAM_ATTEMPT_STATUS.COMPLETED,
                    finishedAt: new Date(),
                    score,
                    correctAnswers: correctCount,
                    totalQuestions,
                    answers: verifiedAnswers,
                },
            });

            const showAnswers = attempt.examSession.showAnswersAfterSubmit;
            const passingScore = attempt.examSession.passingScore || 0;
            const passed = score >= passingScore;

            // Prepare response
            const response: any = {
                message: 'Nộp bài thành công',
                examAttempt: {
                    id: updatedAttempt.id,
                    status: updatedAttempt.status,
                    score: updatedAttempt.score,
                    finishedAt: updatedAttempt.finishedAt,
                },
                score,
                totalQuestions,
                correctAnswers: correctCount,
                percentage: Math.round(score * 10) / 10,
                showAnswers,
                passed,
                passingScore,
            };

            // Only include answers if allowed
            if (showAnswers) {
                response.questions = questions.map((q) => ({
                    ...withAnswer(q),
                    userAnswer: verifiedAnswers[q.id] || null,
                }));
            }

            await this.examAttemptRepository.invalidateUserListCache(user.id);
            await this.examAttemptRepository.invalidateItemCache(user.id, attemptId);
            return response;
        } catch (error) {
            rethrowKnown(error);
            throw new InternalServerErrorException('Nộp bài thất bại');
        }
    }
}
