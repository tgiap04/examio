import { PrismaService } from '../../prisma';
import { rethrowKnown } from '../common/rethrow-known';
import {
    Injectable,
    ConflictException,
    NotFoundException,
    InternalServerErrorException,
} from '@nestjs/common';
import { GenerateIdService } from '@kmaedu/common';

import { CreateExamRoomDto } from './dto/create-examroom.dto';
import { GetExamRoomsDto } from './dto/get-examroom.dto';
import { UpdateExamRoomDto } from './dto/update-examroom.dto';
import { ExamRoomRepository } from './examroom.repository';
import type { AuthUser } from '@kmaedu/auth-jwt';
import type { Metadata } from '@grpc/grpc-js';
import { ASSESS_TYPE } from '../../types';
import { ContentClient } from '../../clients/content.client';
import { toContentHttpException } from '../../clients/content-errors';
import { SnapshotDrift } from '../snapshot/snapshot-drift';
import { UserEnricher } from '../user-profile/user-enricher.service';
import { QuizSetTitles } from './quiz-set-titles.cache';

type RoomWithSet = { quizSetId: string; quizSetTitle: string };

@Injectable()
export class ExamRoomService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly examRoomRepository: ExamRoomRepository,
        private readonly content: ContentClient,
        private readonly titles: QuizSetTitles,
        private readonly drift: SnapshotDrift,
        private readonly generateIdService: GenerateIdService,
        private readonly users: UserEnricher
    ) {}

    /**
     * The caller's quiz set among content-service's, or 404 (missing, or somebody else's: content
     * does not tell them apart). An outage is a 503: a room is never created on a guess.
     */
    private async ownedQuizSet(quizSetId: string, metadata: Metadata) {
        let rows;
        try {
            rows = await this.content.getQuizSetsByIds([quizSetId], metadata);
        } catch (error) {
            throw toContentHttpException(error);
        }
        const found = rows.find((r) => r.id === quizSetId);
        if (!found) {
            throw new NotFoundException('Bộ câu hỏi không tồn tại hoặc không thuộc về bạn');
        }
        return found;
    }

    /** One room as a teacher sees it: host from auth, quiz set title from content (cached, fail-soft). */
    private async teacherView<T extends { hostId: string; quizSetId: string; quizSetTitle: string }>(
        room: T | null,
        metadata: Metadata
    ) {
        if (!room) return null;
        const [withSet] = await this.titles.withQuizSets([room], metadata);
        return this.withHost(withSet);
    }

    /** `host` comes from auth (one batched lookup), never from a relation include. */
    private async withHost<T>(room: T | null): Promise<T | null> {
        if (!room) return null;
        return (await this.users.withHost(
            room as T & { hostId: string }
        )) as T;
    }

    async createExamRoom(user: AuthUser, dto: CreateExamRoomDto, metadata: Metadata) {
        if (!dto.title || dto.title.trim() === '') {
            throw new ConflictException('Tiêu đề không được để trống');
        }

        // The quiz set must exist and be the caller's (content-service answers as the owner).
        const quizSet = await this.ownedQuizSet(dto.quizSetId, metadata);

        try {
            const newExamRoom = await this.examRoomRepository.create(
                {
                    id: this.generateIdService.generateId(),
                    title: dto.title,
                    description: dto.description || '',
                    quizSetId: dto.quizSetId,
                    // Kept on the room: student-facing views show it without ever calling content.
                    quizSetTitle: quizSet.title,
                    hostId: user.id,
                },
                user.id
            );

            return {
                message: 'Tạo phòng thi thành công',
                examRoom: await this.teacherView(newExamRoom, metadata),
            };
        } catch (error) {
            rethrowKnown(error);
            throw new InternalServerErrorException('Tạo phòng thi thất bại');
        }
    }

    async getExamRoomById(id: string, user: AuthUser, metadata: Metadata) {
        const examRoom = await this.examRoomRepository.findOne({
            where: { id, hostId: user.id },
            include: {
                examSessions: {
                    orderBy: { startTime: 'desc' },
                },
            },
            cache: true,
        });

        if (!examRoom) {
            throw new NotFoundException('Phòng thi không tồn tại');
        }

        return this.teacherView(examRoom, metadata);
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

    async getExamRooms(user: AuthUser, dto: GetExamRoomsDto, metadata: Metadata) {
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
            examRooms: await this.titles.withQuizSets(result.data as RoomWithSet[], metadata),
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
    async getAllExamRooms(user: AuthUser, metadata: Metadata) {
        const examRooms = await this.prisma.examRoom.findMany({
            where: {
                hostId: user.id,
            },
            include: {
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
            examRooms: await this.titles.withQuizSets(examRooms, metadata),
        };
    }

    async updateExamRoom(id: string, user: AuthUser, dto: UpdateExamRoomDto, metadata: Metadata) {
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

        // Re-pointing the room: the new quiz set must exist and be the caller's. Sessions already made
        // keep their snapshot of the old one.
        const newQuizSet = dto.quizSetId
            ? await this.ownedQuizSet(dto.quizSetId, metadata)
            : null;

        try {
            await this.examRoomRepository.update(
                id,
                {
                    ...(dto.title && { title: dto.title }),
                    ...(dto.description !== undefined && {
                        description: dto.description,
                    }),
                    ...(newQuizSet && {
                        quizSetId: newQuizSet.id,
                        quizSetTitle: newQuizSet.title,
                        sourceDeleted: false,
                    }),
                },
                user.id
            );

            const updatedExamRoom = await this.examRoomRepository.findOne({
                where: { id },
                cache: false,
            });

            return {
                message: 'Cập nhật phòng thi thành công',
                examRoom: await this.teacherView(updatedExamRoom, metadata),
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
        metadata: Metadata,
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

        // One content call for the whole page: is the quiz set still what each session was built from?
        const annotated = await this.drift.annotate(
            examRoom,
            sessions.map((session) => ({ ...session, attemptCount: session._count.examAttempts })),
            metadata
        );
        // Map sessions to add distinctUserCount
        const sessionsWithDistinctCount = annotated.map(({ attemptCount: _attemptCount, ...session }) => ({
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
