import { PrismaService } from '@examio/database';
import {
    Injectable,
    NotFoundException,
    InternalServerErrorException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import {
    GenerateIdService,
    CryptoService,
    TurnstileService,
} from '@examio/common';
import { User } from '@prisma/client';
import {
    EXAM_SESSION_STATUS,
    EXAM_ATTEMPT_STATUS,
    QUESTION_SELECTION_MODE,
    ASSESS_TYPE,
    LabelQuestionConfig,
} from '../../types';
import { CreateExamAttemptDto } from './dto/create-examattempt.dto';
import { GetExamAttemptsDto } from './dto/get-examattempt.dto';
import { UpdateExamAttemptDto } from './dto/update-examattempt.dto';
import { ExamAttemptRepository } from './examattempt.repository';
import { ExamSessionRepository } from '../examsession/examsession.repository';
import { RedisService, EXPIRED_TIME } from '@examio/redis';
import {
    getUserCacheKey,
    CACHE_MODULES,
    getListCachePattern,
} from '@examio/common';

@Injectable()
export class ExamAttemptService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly examAttemptRepository: ExamAttemptRepository,
        private readonly examSessionRepository: ExamSessionRepository,
        private readonly generateIdService: GenerateIdService,
        private readonly redisService: RedisService,
        private readonly cryptoService: CryptoService,
        private readonly turnstileService: TurnstileService
    ) {}

    /**
     * Enforce exam-session access control before an attempt is created.
     * A guessed/leaked examSessionId must NOT let a non-participant into a
     * private, whitelisted, or code-gated session — both startExamAttempt and
     * createExamAttempt route through here. Mirrors ExamSessionService.checkAccess.
     */
    private assertSessionAccess(
        examSession: any,
        user: User,
        providedCode?: string
    ): void {
        // Public sessions are open to any authenticated user.
        if (examSession.assessType === ASSESS_TYPE.PUBLIC) {
            return;
        }

        // The room host always has access to their own session.
        if (examSession.examRoom?.hostId === user.id) {
            return;
        }

        // Whitelisted participants have access.
        if (
            Array.isArray(examSession.whitelist) &&
            examSession.whitelist.includes(user.id)
        ) {
            return;
        }

        // Code-gated sessions require the correct access code at start time.
        if (examSession.accessCode) {
            if (
                providedCode &&
                providedCode === examSession.accessCode.toString()
            ) {
                return;
            }
            throw new ForbiddenException(
                'Yêu cầu mã truy cập hợp lệ để bắt đầu làm bài'
            );
        }

        // Private with no code and not whitelisted → denied.
        throw new ForbiddenException(
            'Bạn không có quyền truy cập phiên thi này'
        );
    }

    /**
     * Start a new exam attempt or resume existing one
     * Checks retry limits based on ExamSession settings
     */
    async startExamAttempt(user: User, dto: CreateExamAttemptDto) {
        if (dto.turnstileToken) {
            await this.turnstileService.verify(dto.turnstileToken);
        }
        // Verify exam session exists with all needed data
        const examSession = await this.prisma.examSession.findUnique({
            where: { id: dto.examSessionId },
            include: {
                examRoom: {
                    include: {
                        quizSet: {
                            include: {
                                detailsQuizQuestions: {
                                    include: {
                                        quizQuestion: true,
                                        label: true,
                                    },
                                },
                                labels: true,
                            },
                        },
                    },
                },
            },
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

        // Check time constraints
        const now = new Date();
        if (now < examSession.startTime) {
            throw new BadRequestException('Phiên thi chưa bắt đầu');
        }
        if (examSession.endTime && now > examSession.endTime) {
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
        this.assertSessionAccess(examSession, user, dto.accessCode);

        // Count completed attempts
        const completedAttempts = await this.prisma.examAttempt.count({
            where: {
                examSessionId: dto.examSessionId,
                userId: user.id,
                status: EXAM_ATTEMPT_STATUS.COMPLETED,
            },
        });

        // The room host owns the exam and may re-take/preview their own session
        // freely — retry limits apply only to participants, not the owner.
        const isHost = examSession.examRoom.hostId === user.id;

        // Check retry limits (based on ExamSession, not ExamRoom)
        // maxAttempts means the number of RETRIES allowed (not including first attempt)
        // So total allowed attempts = 1 (first) + maxAttempts (retries)
        const totalAllowedAttempts = 1 + examSession.maxAttempts;

        if (!isHost && !examSession.allowRetake && completedAttempts > 0) {
            throw new BadRequestException(
                'Bạn đã làm bài này rồi và không được phép làm lại'
            );
        }

        if (!isHost && completedAttempts >= totalAllowedAttempts) {
            throw new BadRequestException(
                `Bạn đã đạt số lần thi tối đa (${totalAllowedAttempts} lần)`
            );
        }

        // Select questions based on configuration
        const allQuestions =
            examSession.examRoom.quizSet.detailsQuizQuestions || [];
        const selectedQuestionIds = this.selectQuestionsForAttempt(
            allQuestions,
            examSession.questionSelectionMode,
            examSession.questionCount,
            examSession.labelQuestionConfig as LabelQuestionConfig[] | null,
            examSession.shuffleQuestions
        );

        const totalQuestions = selectedQuestionIds.length;

        try {
            const newExamAttempt = await this.prisma.examAttempt.create({
                data: {
                    id: this.generateIdService.generateId(),
                    examSessionId: dto.examSessionId,
                    userId: user.id,
                    score: 0,
                    violationCount: 0,
                    startedAt: new Date(),
                    status: EXAM_ATTEMPT_STATUS.IN_PROGRESS,
                    answers: {},
                    currentIndex: 0,
                    markedQuestions: [],
                    totalQuestions,
                    correctAnswers: 0,
                    selectedQuestionIds,
                },
            });

            return {
                message: 'Bắt đầu làm bài thành công',
                examAttempt: newExamAttempt,
                isResume: false,
            };
        } catch (error) {
            throw new InternalServerErrorException('Bắt đầu làm bài thất bại');
        }
    }

    /**
     * Select questions for an attempt based on the session configuration
     */
    private selectQuestionsForAttempt(
        allQuestions: Array<{
            id: string;
            labelId: string | null;
            quizQuestion: any;
        }>,
        selectionMode: number,
        questionCount: number | null,
        labelConfig: LabelQuestionConfig[] | null,
        shuffleQuestions: boolean
    ): string[] {
        let selectedIds: string[] = [];

        switch (selectionMode) {
            case QUESTION_SELECTION_MODE.ALL:
                // Use all questions
                selectedIds = allQuestions.map((q) => q.id);
                break;

            case QUESTION_SELECTION_MODE.RANDOM_TOTAL:
                // Randomly select N questions from total
                if (questionCount && questionCount > 0) {
                    const shuffled = [...allQuestions].sort(
                        () => Math.random() - 0.5
                    );
                    selectedIds = shuffled
                        .slice(0, questionCount)
                        .map((q) => q.id);
                } else {
                    selectedIds = allQuestions.map((q) => q.id);
                }
                break;

            case QUESTION_SELECTION_MODE.RANDOM_BY_LABEL:
                // Select questions based on label configuration
                if (labelConfig && labelConfig.length > 0) {
                    for (const config of labelConfig) {
                        const labelId =
                            config.labelId === 'unlabeled'
                                ? null
                                : config.labelId;
                        const questionsInLabel = allQuestions.filter(
                            (q) => q.labelId === labelId
                        );

                        // Shuffle and take the required count
                        const shuffled = [...questionsInLabel].sort(
                            () => Math.random() - 0.5
                        );
                        const selected = shuffled.slice(0, config.count);
                        selectedIds.push(...selected.map((q) => q.id));
                    }
                } else {
                    // Fallback to all questions if no config
                    selectedIds = allQuestions.map((q) => q.id);
                }
                break;

            default:
                selectedIds = allQuestions.map((q) => q.id);
        }

        // Shuffle final order if enabled
        if (shuffleQuestions) {
            selectedIds = selectedIds.sort(() => Math.random() - 0.5);
        }

        return selectedIds;
    }

    /**
     * Update exam attempt progress (auto-save)
     */
    async updateExamAttemptProgress(
        attemptId: string,
        user: User,
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

            return {
                message: 'Cập nhật bài làm thành công',
                examAttempt: updatedAttempt,
            };
        } catch (error) {
            throw new InternalServerErrorException('Cập nhật bài làm thất bại');
        }
    }

    /**
     * Submit exam attempt - calculate score
     * Returns detailed answers based on showAnswersAfterSubmit setting
     */
    async submitExamAttempt(attemptId: string, user: User) {
        // Get attempt with session and questions
        const attempt = await this.prisma.examAttempt.findFirst({
            where: { id: attemptId, userId: user.id },
            include: {
                examSession: {
                    include: {
                        examRoom: {
                            include: {
                                quizSet: {
                                    include: {
                                        detailsQuizQuestions: {
                                            include: {
                                                quizQuestion: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!attempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        if (attempt.status !== EXAM_ATTEMPT_STATUS.IN_PROGRESS) {
            throw new BadRequestException('Bài làm đã được nộp trước đó');
        }

        // Calculate score
        // Get all questions map for efficient lookup
        const allQuestionsMap = new Map(
            attempt.examSession.examRoom.quizSet.detailsQuizQuestions.map(
                (d) => [d.id, d.quizQuestion]
            )
        );

        // Filter questions based on selectedQuestionIds
        let questions: any[] = [];
        if (
            attempt.selectedQuestionIds &&
            attempt.selectedQuestionIds.length > 0
        ) {
            questions = attempt.selectedQuestionIds
                .map((id) => allQuestionsMap.get(id))
                .filter((q) => q != null);
        } else {
            questions =
                attempt.examSession.examRoom.quizSet.detailsQuizQuestions
                    ?.map((d) => d.quizQuestion)
                    .filter((q) => q != null) || [];
        }

        const answers = attempt.answers as Record<string, string>;
        let correctCount = 0;

        questions.forEach((q) => {
            if (q && q.id && answers[q.id] === q.answer) {
                correctCount++;
            }
        });

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
            console.log(
                '🚀 ~ ExamAttemptService ~ submitExamAttempt ~ attempt.examSession.showAnswersAfterSubmit:',
                attempt.examSession.showAnswersAfterSubmit
            );
            const passingScore = attempt.examSession.passingScore || 0;
            const passed = score >= passingScore;

            await this.examAttemptRepository.invalidateUserListCache(user.id);

            // Prepare response based on showAnswersAfterSubmit
            if (showAnswers) {
                // Return questions with correct answers
                return {
                    message: 'Nộp bài thành công',
                    examAttempt: updatedAttempt,
                    score,
                    totalQuestions,
                    correctAnswers: correctCount,
                    percentage: Math.round(score * 10) / 10,
                    showAnswers: true,
                    passed,
                    passingScore,
                    questions: questions.map((q) => ({
                        id: q.id,
                        question: q.question,
                        options: q.options,
                        answer: q.answer, // Include correct answer
                    })),
                };
            } else {
                // Only return score summary
                return {
                    message: 'Nộp bài thành công',
                    examAttempt: updatedAttempt,
                    score,
                    totalQuestions,
                    correctAnswers: correctCount,
                    percentage: Math.round(score * 10) / 10,
                    showAnswers: false,
                    passed,
                    passingScore,
                };
            }
        } catch (error) {
            throw new InternalServerErrorException('Nộp bài thất bại');
        }
    }

    /**
     * Get exam attempt with questions for quiz
     * Answers are stripped for students (only included for owners or after submit if allowed)
     */
    async getExamAttemptForQuiz(attemptId: string, user: User) {
        const attempt = await this.prisma.examAttempt.findFirst({
            where: { id: attemptId, userId: user.id },
            include: {
                examSession: {
                    include: {
                        examRoom: {
                            include: {
                                quizSet: {
                                    include: {
                                        detailsQuizQuestions: {
                                            include: {
                                                quizQuestion: true,
                                            },
                                        },
                                    },
                                },
                                host: {
                                    select: {
                                        id: true,
                                        username: true,
                                        name: true,
                                        avatar: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!attempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        const isOwner = attempt.examSession.examRoom.host.id === user.id;
        const showAnswers =
            attempt.status === EXAM_ATTEMPT_STATUS.COMPLETED &&
            attempt.examSession.showAnswersAfterSubmit;

        // Get all questions from the quiz set
        const allQuestionsMap = new Map(
            attempt.examSession.examRoom.quizSet.detailsQuizQuestions.map(
                (d) => [d.id, d]
            )
        );

        // Filter questions based on selectedQuestionIds if available
        let filteredQuestionDetails =
            attempt.examSession.examRoom.quizSet.detailsQuizQuestions;
        if (
            attempt.selectedQuestionIds &&
            attempt.selectedQuestionIds.length > 0
        ) {
            // Maintain the order of selectedQuestionIds
            filteredQuestionDetails = attempt.selectedQuestionIds
                .map((id) => allQuestionsMap.get(id))
                .filter(
                    (d): d is (typeof filteredQuestionDetails)[0] =>
                        d !== undefined
                );
        }

        const questions = filteredQuestionDetails.map((d) => {
            const q = d.quizQuestion;
            if (isOwner || showAnswers) {
                return {
                    id: q.id,
                    question: q.question,
                    options: q.options,
                    answer: q.answer,
                };
            }
            return {
                id: q.id,
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

        return {
            ...attempt,
            questions,
            timeLimitMinutes,
            creator: attempt.examSession.examRoom.host,
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
        user: User,
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
            throw new ForbiddenException('Bạn không có quyền xem dữ liệu này');
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
            const [paginatedAttempts, distinctUserGroups] = await Promise.all([
                this.prisma.examAttempt.findMany({
                    where: distinctWhere,
                    distinct: ['userId'],
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                name: true,
                                email: true,
                                avatar: true,
                            },
                        },
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
        const [attempts, total] = await Promise.all([
            this.prisma.examAttempt.findMany({
                where: {
                    examSession: {
                        examRoomId: examRoomId,
                    },
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            name: true,
                            email: true,
                            avatar: true,
                        },
                    },
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
    async getExamAttemptDetailForSlider(attemptId: string, user: User) {
        const attempt = await this.prisma.examAttempt.findUnique({
            where: { id: attemptId },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        name: true,
                        email: true,
                        avatar: true,
                    },
                },
                examSession: {
                    include: {
                        examRoom: {
                            include: {
                                quizSet: {
                                    include: {
                                        detailsQuizQuestions: {
                                            include: { quizQuestion: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!attempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        // Only owner or attempt owner can see attempt details
        if (attempt.examSession.examRoom.hostId !== user.id && attempt.userId !== user.id) {
            throw new ForbiddenException('Bạn không có quyền xem dữ liệu này');
        }

        // Calculate time spent
        let timeSpentSeconds = 0;
        if (attempt.finishedAt && attempt.startedAt) {
            timeSpentSeconds = Math.floor(
                (new Date(attempt.finishedAt).getTime() -
                    new Date(attempt.startedAt).getTime()) /
                    1000
            );
        }

        // Decrypt questions for attempt owner or host
        let questions: Array<{ id: string; question: string; options: string[]; answer?: string; userAnswer?: string | null }> = [];
        const canViewQuestions = attempt.userId === user.id || attempt.examSession.examRoom.hostId === user.id;
        if (canViewQuestions) {
            const showAnswers = attempt.status === EXAM_ATTEMPT_STATUS.COMPLETED;
            const attemptAnswers = (attempt.answers as Record<string, string>) || {};
            questions = attempt.examSession.examRoom.quizSet.detailsQuizQuestions.map((dq) => {
              const q = dq.quizQuestion;
              // Answers are keyed by quizQuestion.id (not dq.id)
              const userAnswer = attemptAnswers[q.id] ?? null;
              if (showAnswers) {
                return {
                  id: dq.id,
                  question: q.question,
                  options: q.options,
                  answer: q.answer,
                  userAnswer,
                };
              }
              return {
                id: dq.id,
                question: q.question,
                options: q.options,
                userAnswer,
              };
            });
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
            currentIndex: attempt.currentIndex,
            markedQuestions: attempt.markedQuestions,
            violationCount: attempt.violationCount,
            user: attempt.user,
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
        user: User,
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
            throw new ForbiddenException('Bạn không có quyền xem dữ liệu này');
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
            const candidateAttempts = pagedUserIds.length
                ? await this.prisma.examAttempt.findMany({
                      where: {
                          examSessionId: sessionId,
                          userId: { in: pagedUserIds },
                      },
                      include: {
                          user: {
                              select: {
                                  id: true,
                                  username: true,
                                  name: true,
                                  email: true,
                                  avatar: true,
                              },
                          },
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
        const [attempts, total] = await Promise.all([
            this.prisma.examAttempt.findMany({
                where: { examSessionId: sessionId },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            name: true,
                            email: true,
                            avatar: true,
                        },
                    },
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

    async createExamAttempt(user: User, dto: CreateExamAttemptDto) {
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
        this.assertSessionAccess(examSession, user, dto.accessCode);

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
            const newExamAttempt = await this.examAttemptRepository.create(
                {
                    id: this.generateIdService.generateId(),
                    examSessionId: dto.examSessionId,
                    userId: user.id,
                    score: 0,
                    violationCount: 0,
                    startedAt: new Date(),
                    status: EXAM_ATTEMPT_STATUS.IN_PROGRESS,
                },
                user.id
            );

            // Load relations for response
            const examAttemptWithRelations =
                await this.examAttemptRepository.findOne({
                    where: { id: newExamAttempt.id },
                    include: {
                        examSession: {
                            include: {
                                examRoom: {
                                    include: {
                                        quizSet: true,
                                    },
                                },
                            },
                        },
                        user: {
                            select: {
                                id: true,
                                email: true,
                                name: true,
                            },
                        },
                    },
                    cache: false,
                });

            return {
                message: 'Bắt đầu làm bài thành công',
                examAttempt: examAttemptWithRelations,
            };
        } catch (error) {
            throw new InternalServerErrorException('Bắt đầu làm bài thất bại');
        }
    }

    async getExamAttemptById(id: string, user: User) {
        const examAttempt = await this.examAttemptRepository.findOne({
            where: { id },
            include: {
                examSession: {
                    include: {
                        examRoom: {
                            include: {
                                quizSet: {
                                    include: {
                                        detailsQuizQuestions: {
                                            include: {
                                                quizQuestion: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                    },
                },
            },
            cache: true,
        });

        if (!examAttempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        // User can only view their own attempts, or host can view all attempts
        if (
            (examAttempt as any).userId !== user.id &&
            (examAttempt as any).examSession.examRoom.hostId !== user.id
        ) {
            throw new ForbiddenException('Bạn không có quyền xem bài làm này');
        }

        // Filter questions based on selectedQuestionIds if available
        const attemptData = examAttempt as any;
        if (
            attemptData.selectedQuestionIds &&
            attemptData.selectedQuestionIds.length > 0
        ) {
            const allQuestionsMap = new Map(
                attemptData.examSession.examRoom.quizSet.detailsQuizQuestions.map(
                    (d: any) => [d.id, d]
                )
            );

            attemptData.examSession.examRoom.quizSet.detailsQuizQuestions =
                attemptData.selectedQuestionIds
                    .map((id: string) => allQuestionsMap.get(id))
                    .filter((d: any) => d !== undefined);
        }

        return examAttempt;
    }

    async deleteExamAttempt(id: string, user: User) {
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
            throw new ForbiddenException('Bạn không có quyền xóa bài làm này');
        }

        // Hard delete - pass userId (host) for proper cache invalidation
        await this.examAttemptRepository.delete(id, user.id);
        return { message: 'Xóa bài làm thành công' };
    }

    async getExamAttempts(user: User, dto: GetExamAttemptsDto) {
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
                                    quizSet: {
                                        select: {
                                            id: true,
                                            title: true,
                                            thumbnail: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    user: {
                        select: {
                            id: true,
                            email: true,
                            name: true,
                        },
                    },
                },
                sortBy: 'startedAt',
                sortType: 'desc',
                cache: true,
            },
            user.id
        );

        return {
            examAttempts: result.data,
            total: result.total,
            page: result.page,
            limit: result.size,
            totalPages: result.totalPages,
        };
    }

    async updateExamAttempt(id: string, user: User, dto: UpdateExamAttemptDto) {
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

        const isHost =
            (examAttempt as any).examSession.examRoom.hostId === user.id;

        // User can update their own attempt, host can update any attempt
        if ((examAttempt as any).userId !== user.id && !isHost) {
            throw new ForbiddenException(
                'Bạn không có quyền chỉnh sửa bài làm này'
            );
        }

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
                    include: {
                        examSession: {
                            include: {
                                examRoom: {
                                    include: {
                                        quizSet: true,
                                    },
                                },
                            },
                        },
                        user: {
                            select: {
                                id: true,
                                email: true,
                                name: true,
                            },
                        },
                    },
                    cache: false,
                }
            );

            return {
                message: 'Cập nhật bài làm thành công',
                examAttempt: updatedExamAttempt,
            };
        } catch (error) {
            if (error.code === 'P2025') {
                throw new NotFoundException('Bài làm không tồn tại');
            }
            throw new InternalServerErrorException('Cập nhật bài làm thất bại');
        }
    }

    /**
     * Get aggregated history statistics for user
     * Optimized with COUNT queries (O(1) with indexed fields) and Redis caching
     */
    async getHistoryStats(user: User) {
        const cacheKey = getUserCacheKey('QUIZ_STATS', user.id) + ':history';

        // Check cache first
        const cached = await this.redisService.get<{
            totalPDFs: number;
            examsCreated: number;
            flashcardSets: number;
            totalStudyHours: number;
        }>(cacheKey);

        if (cached) {
            return cached;
        }

        // Execute all count queries in parallel for O(1) performance
        const [totalPDFs, examsCreated, flashcardSets, durationResult] =
            await Promise.all([
                // Count PDFs uploaded by user (indexed on userId)
                this.prisma.userStorage.count({
                    where: { userId: user.id },
                }),
                // Count quiz sets created by user (indexed on userId)
                this.prisma.quizSet.count({
                    where: { userId: user.id },
                }),
                // Count flashcard sets created by user (indexed on userId)
                this.prisma.flashCardSet.count({
                    where: { userId: user.id },
                }),
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
        const totalStudyHours = Math.round(totalSeconds / 3600);

        const stats = {
            totalPDFs,
            examsCreated,
            flashcardSets,
            totalStudyHours,
        };

        // Cache for 5 minutes
        await this.redisService.set(cacheKey, stats, EXPIRED_TIME.FIVE_MINUTES);

        return stats;
    }

    // ==================== SECURE QUIZ METHODS ====================

    /**
     * Get exam attempt with encrypted questions and JWT tokens
     * NEVER returns answer field - secure endpoint for quiz taking
     */
    async getSecureQuizQuestions(attemptId: string, user: User) {
        const attempt = await this.prisma.examAttempt.findFirst({
            where: { id: attemptId, userId: user.id },
            include: {
                examSession: {
                    include: {
                        examRoom: {
                            include: {
                                quizSet: {
                                    include: {
                                        detailsQuizQuestions: {
                                            include: {
                                                quizQuestion: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!attempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        // Calculate expiry time based on session end time
        const expirySeconds = this.cryptoService.calculateExpirySeconds(
            attempt.examSession.endTime
        );

        // Get all questions from the quiz set
        const allQuestionsMap = new Map(
            attempt.examSession.examRoom.quizSet.detailsQuizQuestions.map(
                (d) => [d.id, d]
            )
        );

        // Filter questions based on selectedQuestionIds if available
        let filteredQuestionDetails =
            attempt.examSession.examRoom.quizSet.detailsQuizQuestions;
        if (
            attempt.selectedQuestionIds &&
            attempt.selectedQuestionIds.length > 0
        ) {
            // Maintain the order of selectedQuestionIds
            filteredQuestionDetails = attempt.selectedQuestionIds
                .map((id) => allQuestionsMap.get(id))
                .filter(
                    (d): d is (typeof filteredQuestionDetails)[0] =>
                        d !== undefined
                );
        }

        // Generate secure questions with per-question JWT tokens.
        // Content is served as plaintext over TLS (auth-scoped to the attempt
        // owner, answers never included). The previous AES layer used a key
        // shipped in the client bundle, so it provided no real protection —
        // decryption is no longer done client-side. See security audit C5.
        const secureQuestions = filteredQuestionDetails.map((d, index) => {
            const q = d.quizQuestion;

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
        user: User,
        answers: Array<{ token: string; chosen_option: string }>
    ) {
        // Get attempt with session and questions
        const attempt = await this.prisma.examAttempt.findFirst({
            where: { id: attemptId, userId: user.id },
            include: {
                examSession: {
                    include: {
                        examRoom: {
                            include: {
                                quizSet: {
                                    include: {
                                        detailsQuizQuestions: {
                                            include: {
                                                quizQuestion: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!attempt) {
            throw new NotFoundException('Bài làm không tồn tại');
        }

        if (attempt.status !== EXAM_ATTEMPT_STATUS.IN_PROGRESS) {
            throw new BadRequestException('Bài làm đã được nộp trước đó');
        }

        // Build question map for lookup
        // Get all questions from the quiz set
        const allQuestionsMap = new Map(
            attempt.examSession.examRoom.quizSet.detailsQuizQuestions.map(
                (d) => [d.id, d]
            )
        );

        // Filter questions based on selectedQuestionIds if available
        let filteredQuestionDetails =
            attempt.examSession.examRoom.quizSet.detailsQuizQuestions;
        if (
            attempt.selectedQuestionIds &&
            attempt.selectedQuestionIds.length > 0
        ) {
            // Maintain the order of selectedQuestionIds
            filteredQuestionDetails = attempt.selectedQuestionIds
                .map((id) => allQuestionsMap.get(id))
                .filter(
                    (d): d is (typeof filteredQuestionDetails)[0] =>
                        d !== undefined
                );
        }

        const questionMap = new Map<
            string,
            { id: string; answer: string; index: number }
        >();
        filteredQuestionDetails.forEach((d, index) => {
            questionMap.set(d.quizQuestion.id, {
                id: d.quizQuestion.id,
                answer: d.quizQuestion.answer,
                index,
            });
        });

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
                response.questions = filteredQuestionDetails.map((d) => ({
                    id: d.quizQuestion.id,
                    question: d.quizQuestion.question,
                    options: d.quizQuestion.options,
                    answer: d.quizQuestion.answer,
                    userAnswer: verifiedAnswers[d.quizQuestion.id] || null,
                }));
            }

            await this.examAttemptRepository.invalidateUserListCache(user.id);
            return response;
        } catch (error) {
            throw new InternalServerErrorException('Nộp bài thất bại');
        }
    }
}
