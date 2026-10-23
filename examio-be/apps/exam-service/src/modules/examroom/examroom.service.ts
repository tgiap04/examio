import { PrismaService } from '../../prisma';
import { rethrowKnown } from '../common/rethrow-known';
import {
    Injectable,
    ConflictException,
    NotFoundException,
    InternalServerErrorException,
} from '@nestjs/common';
import { GenerateIdService } from '@examio/common';

import { CreateExamRoomDto } from './dto/create-examroom.dto';
import { GetExamRoomsDto } from './dto/get-examroom.dto';
import { UpdateExamRoomDto } from './dto/update-examroom.dto';
import { ExamRoomRepository } from './examroom.repository';
import { QuizSetRepository } from '../quizset/quizset.repository';
import type { AuthUser } from '@examio/auth-jwt';
import { ASSESS_TYPE } from '../../types';
import { UserEnricher } from '../user-profile/user-enricher.service';

@Injectable()
export class ExamRoomService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly examRoomRepository: ExamRoomRepository,
        private readonly quizSetRepository: QuizSetRepository,
        private readonly generateIdService: GenerateIdService,
        private readonly users: UserEnricher
    ) {}

    /** `host` comes from auth (one batched lookup), never from a relation include. */
    private async withHost<T>(room: T | null): Promise<T | null> {
        if (!room) return null;
        return (await this.users.withHost(
            room as T & { hostId: string }
        )) as T;
    }

    async createExamRoom(user: AuthUser, dto: CreateExamRoomDto) {
        if (!dto.title || dto.title.trim() === '') {
            throw new ConflictException('Tiêu đề không được để trống');
        }

        // Verify quiz set exists and belongs to user
        const quizSet = await this.quizSetRepository.findOne({
            where: { id: dto.quizSetId, userId: user.id },
            cache: true,
        });

        if (!quizSet) {
            throw new NotFoundException(
                'Bộ câu hỏi không tồn tại hoặc không thuộc về bạn'
            );
        }

        try {
            const newExamRoom = await this.examRoomRepository.create(
                {
                    id: this.generateIdService.generateId(),
                    title: dto.title,
                    description: dto.description || '',
                    quizSetId: dto.quizSetId,
                    hostId: user.id,
                },
                user.id
            );

            // Load relations for response
            const examRoomWithRelations = await this.examRoomRepository.findOne(
                {
                    where: { id: newExamRoom.id },
                    include: {
                        quizSet: true,
                    },
                    cache: false,
                }
            );

            return {
                message: 'Tạo phòng thi thành công',
                examRoom: await this.withHost(examRoomWithRelations),
            };
        } catch (error) {
            rethrowKnown(error);
            throw new InternalServerErrorException('Tạo phòng thi thất bại');
        }
    }

    async getExamRoomById(id: string, user: AuthUser) {
        const examRoom = await this.examRoomRepository.findOne({
            where: { id, hostId: user.id },
            include: {
                quizSet: true,
                examSessions: {
                    orderBy: { startTime: 'desc' },
                },
            },
            cache: true,
        });

        if (!examRoom) {
            throw new NotFoundException('Phòng thi không tồn tại');
        }

        return this.withHost(examRoom);
    }

    async deleteExamRoom(id: string, user: AuthUser) {
        // Check ownership
        const examRoom = await this.examRoomRepository.findOne({
            where: { id, hostId: user.id },
            cache: false,
        });

        if (!examRoom) {
            throw new NotFoundException('Phòng thi không tồn tại');
        }

        // Hard delete - pass userId for proper cache invalidation
        await this.examRoomRepository.delete(id, user.id);

        return { message: 'Xóa phòng thi thành công' };
    }

    /**
     * Anonymous teaser for a room that has at least one PUBLIC session: title,
     * description and the host's display name and avatar. Never an email, the
     * quiz set or any session data; any other room is "not found".
     */
    async getExamRoomPublicById(id: string) {
        const examRoom = await this.prisma.examRoom.findFirst({
            where: { id, examSessions: { some: { assessType: ASSESS_TYPE.PUBLIC } } },
            select: {
                id: true,
                title: true,
                description: true,
                hostId: true,
            },
        });
        if (!examRoom) {
            throw new NotFoundException('Phòng thi không tồn tại');
        }
        const { hostId, ...teaser } = examRoom;
        const host = (await this.users.profileMap([hostId])).get(hostId);
        return {
            ...teaser,
            host: { name: host?.name ?? null, avatar: host?.avatar ?? null },
        };
    }

    async getExamRooms(user: AuthUser, dto: GetExamRoomsDto) {
        const where: any = {
            hostId: user.id,
        };

        if (dto.search) {
            where.OR = [
                { title: { contains: dto.search, mode: 'insensitive' } },
                { description: { contains: dto.search, mode: 'insensitive' } },
            ];
        }

        if (dto.quizSetId) {
            where.quizSetId = dto.quizSetId;
        }

        const result = await this.examRoomRepository.paginate(
            {
                page: dto.page || 1,
                size: dto.limit || 10,
                ...where,
                include: {
                    quizSet: {
                        select: {
                            id: true,
                            title: true,
                            thumbnail: true,
                        },
                    },
                    _count: {
                        select: {
                            examSessions: true,
                        },
                    },
                },
                sortBy: 'createdAt',
                sortType: 'desc',
                cache: true,
            },
            user.id
        );

        return {
            examRooms: result.data,
            total: result.total,
            page: result.page,
            limit: result.size,
            totalPages: result.totalPages,
        };
    }

    /**
     * Get all exam rooms for a user without pagination
     * Used for dropdowns and selection lists
     */
    async getAllExamRooms(user: AuthUser) {
        const examRooms = await this.prisma.examRoom.findMany({
            where: {
                hostId: user.id,
            },
            include: {
                quizSet: {
                    select: {
                        id: true,
                        title: true,
                        thumbnail: true,
                        _count: {
                            select: {
                                detailsQuizQuestions: true,
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        examSessions: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return {
            examRooms,
        };
    }

    async updateExamRoom(id: string, user: AuthUser, dto: UpdateExamRoomDto) {
        // Check if exam room exists and belongs to user
        const existingRoom = await this.examRoomRepository.findOne({
            where: { id },
            cache: false,
        });

        if (!existingRoom) {
            throw new NotFoundException('Phòng thi không tồn tại');
        }

        if (existingRoom.hostId !== user.id) {
            throw new NotFoundException('Phòng thi không tồn tại');
        }

        // If updating quizSetId, verify it exists and belongs to user
        if (dto.quizSetId) {
            const quizSet = await this.quizSetRepository.findOne({
                where: { id: dto.quizSetId, userId: user.id },
                cache: true,
            });

            if (!quizSet) {
                throw new NotFoundException(
                    'Bộ câu hỏi không tồn tại hoặc không thuộc về bạn'
                );
            }
        }

        try {
            await this.examRoomRepository.update(
                id,
                {
                    ...(dto.title && { title: dto.title }),
                    ...(dto.description !== undefined && {
                        description: dto.description,
                    }),
                    ...(dto.quizSetId && { quizSetId: dto.quizSetId }),
                },
                user.id
            );

            // Load with relations for response
            const updatedExamRoom = await this.examRoomRepository.findOne({
                where: { id },
                include: {
                    quizSet: true,
                },
                cache: false,
            });

            return {
                message: 'Cập nhật phòng thi thành công',
                examRoom: await this.withHost(updatedExamRoom),
            };
        } catch (error) {
            rethrowKnown(error);
            if (error.code === 'P2025') {
                throw new NotFoundException('Phòng thi không tồn tại');
            }
            throw new InternalServerErrorException(
                'Cập nhật phòng thi thất bại'
            );
        }
    }

    /**
     * Get exam sessions for an exam room with pagination
     */
    async getExamSessions(
        examRoomId: string,
        user: AuthUser,
        page = 1,
        limit = 10
    ) {
        // Check ownership
        const examRoom = await this.examRoomRepository.findOne({
            where: { id: examRoomId, hostId: user.id },
            cache: true,
        });

        if (!examRoom) {
            throw new NotFoundException('Phòng thi không tồn tại');
        }

        const skip = (page - 1) * limit;

        const [sessions, total, distinctParticipants] = await Promise.all([
            this.prisma.examSession.findMany({
                where: {
                    examRoomId: examRoomId,
                },
                include: {
                    _count: {
                        select: {
                            examAttempts: true,
                        },
                    },
                    examAttempts: {
                        distinct: ['userId'],
                        select: { userId: true },
                    },
                },
                skip,
                take: limit,
                orderBy: {
                    startTime: 'desc',
                },
            }),
            this.prisma.examSession.count({
                where: {
                    examRoomId: examRoomId,
                },
            }),
            // Count distinct participants across ALL sessions in this room
            this.prisma.examAttempt.groupBy({
                by: ['userId'],
                where: {
                    examSession: {
                        examRoomId: examRoomId,
                    },
                },
            }),
        ]);

        // Map sessions to add distinctUserCount
        const sessionsWithDistinctCount = sessions.map((session) => ({
            ...session,
            distinctUserCount: session.examAttempts.length,
            examAttempts: undefined,
        }));

        return {
            sessions: sessionsWithDistinctCount,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            totalDistinctParticipants: distinctParticipants.length,
        };
    }
}
