import { PrismaService } from '../../prisma';
import { rethrowKnown } from '../common/rethrow-known';
import {
    Injectable,
    ConflictException,
    Inject,
    NotFoundException,
    InternalServerErrorException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { GenerateIdService, ownerKeyFolder, sanitizeFilename } from '@examio/common';
import { assertThumbnailAllowed, thumbnailKeyToDelete } from '../common/owned-thumbnail';
import { R2DeleteTaskWriter } from '@examio/messaging';
import { RedisService } from '@examio/redis';

import { CreateFlashcardsetDto } from './dto/create-flashcardset.dto';
import { GetFlashcardsetsDto } from './dto/get-flashcardset.dto';
import { UpdateFlashcardSetDto } from './dto/update-flashcardset.dto';
import { SetFlashcardToFlashcardsetDto } from './dto/set-flashcard-to-flashcardset-dto';
import { SaveHistoryToFlashcardsetDto } from './dto/save-history-to-flashcardset.dto';
import { FlashcardSetUpdateSharingSettingsDto } from './dto/sharing.dto';
import {
    appendCodeGranted,
    applySharingUpdate,
} from '../common/sharing-list.util';
import {
    prepareSharingUpdate,
    toSharingView,
} from '../common/sharing-view.util';
import {
    CreateFlashcardLabelDto,
    UpdateFlashcardLabelDto,
    AssignFlashcardsToLabelDto,
} from './dto/flashcard-label.dto';
import { FlashCardSetRepository } from './flashcardset.repository';
import { R2Client } from '../../clients/r2.client';
import { buildMetadata } from '@examio/grpc';
import type { AuthUser } from '@examio/auth-jwt';
import {
    generateAccessCode,
    verifyAccessCodeOrThrow,
} from '../common/access-code-guard';
import { accessKindOf } from './flashcardset-access';
import { UserEnricher } from '../user-profile/user-enricher.service';
import {
    toFlashcardSetPublicView,
    toFlashcardSetStudyView,
} from './flashcardset-public.mapper';

const THUMBNAIL_AREA = 'flashcardset-thumbnails';

@Injectable()
export class FlashcardsetService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly flashcardSetRepository: FlashCardSetRepository,
        private readonly generateIdService: GenerateIdService,
        private readonly r2Service: R2Client,
        private readonly redis: RedisService,
        private readonly users: UserEnricher,
        private readonly r2Deletes: R2DeleteTaskWriter
    ) {}

    async createFlashcardSet(
        user: AuthUser,
        dto: CreateFlashcardsetDto,
        thumbnailFile?: Express.Multer.File
    ) {
        if (!dto.title || dto.title.trim() === '') {
            throw new ConflictException('Tiêu đề không được để trống');
        }

        assertThumbnailAllowed(dto.thumbnail, THUMBNAIL_AREA, user.id);

        try {
            // Handle thumbnail upload if file is provided
            let thumbnailUrl = dto.thumbnail || null;
            if (thumbnailFile) {
                const fileName = `${this.generateIdService.generateId()}-${sanitizeFilename(thumbnailFile.originalname)}`;
                const r2Key = await this.r2Service.uploadFile(
                    fileName,
                    thumbnailFile.buffer,
                    thumbnailFile.mimetype,
                    ownerKeyFolder(THUMBNAIL_AREA, user.id),
                    buildMetadata()
                );
                thumbnailUrl = this.r2Service.getPublicUrl(r2Key);
            }

            const newFlashcardSet = await this.flashcardSetRepository.create(
                {
                    id: this.generateIdService.generateId(),
                    title: dto.title,
                    description: dto.description || '',
                    isPublic:
                        dto.isPublic === true ||
                        dto.isPublic?.toString() === 'true',
                    isPinned:
                        dto.isPinned === true ||
                        dto.isPinned?.toString() === 'true',
                    tag: Array.isArray(dto.tags)
                        ? dto.tags
                        : typeof dto.tags === 'string'
                          ? JSON.parse(dto.tags)
                          : [],
                    userId: user.id,
                    thumbnail: thumbnailUrl,
                },
                user.id
            );
            // Transform 'tag' to 'tags' for frontend compatibility
            const { tag, ...rest } = newFlashcardSet as any;
            return {
                message: 'Tạo bộ thẻ ghi nhớ thành công',
                flashcardSet: {
                    ...rest,
                    tags: tag,
                },
            };
        } catch (error) {
            rethrowKnown(error);
            console.log(error);
            throw new InternalServerErrorException(
                'Tạo bộ thẻ ghi nhớ thất bại'
            );
        }
    }

    async getFlashcardSetStats(user: AuthUser) {
        try {
            // Get total count and total view count in a single query
            const stats = await this.prisma.flashCardSet.aggregate({
                where: { userId: user.id },
                _count: true,
                _sum: { viewCount: true },
            });

            // Get total cards count
            const cardCountResult =
                await this.prisma.detailsFlashCard.aggregate({
                    where: {
                        flashCardSet: {
                            userId: user.id,
                        },
                    },
                    _count: true,
                });

            const totalCards = cardCountResult._count || 0;

            return {
                totalGroups: stats._count || 0,
                totalCards,
                totalViews: stats._sum?.viewCount || 0,
            };
        } catch (error) {
            rethrowKnown(error);
            throw new InternalServerErrorException(
                'Lấy thống kê bộ thẻ ghi nhớ thất bại'
            );
        }
    }

    async getFlashcardSetById(id: string, user: AuthUser) {
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id, userId: user.id },
            include: {
                detailsFlashCard: {
                    include: {
                        flashCard: true,
                    },
                },
            },
            cache: true,
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        // Transform để trả về flashCards như cũ và map 'tag' to 'tags'
        const { detailsFlashCard, tag, ...flashcardSetData } =
            flashcardSet as any;
        return {
            ...flashcardSetData,
            tags: tag,
            flashCards: detailsFlashCard.map((detail: any) => detail.flashCard),
        };
    }

    /**
     * Get flashcards with pagination for a flashcard set
     * Tối ưu query bằng cách chỉ lấy flashcards cần thiết theo page/limit
     */
    async getFlashcardSetFlashcards(
        id: string,
        user: AuthUser,
        page: number = 1,
        limit: number = 10,
        labelId?: string | null
    ) {
        // Ensure page and limit are numbers (query params come as strings)
        const pageNum = Number(page) || 1;
        const limitNum = Number(limit) || 10;

        // First verify ownership
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id, userId: user.id },
            cache: true,
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        const skip = (pageNum - 1) * limitNum;

        // Build where condition for filtering
        const whereCondition: any = { flashCardSetId: id };
        if (labelId === 'unlabeled') {
            whereCondition.labelId = null;
        } else if (labelId) {
            whereCondition.labelId = labelId;
        }

        // Get total count
        const totalCount = await this.prisma.detailsFlashCard.count({
            where: whereCondition,
        });

        // Get paginated flashcards - order by flashCard.createdAt
        const detailsFlashCards = await this.prisma.detailsFlashCard.findMany({
            where: whereCondition,
            include: {
                flashCard: true,
                label: true,
            },
            skip,
            take: limitNum,
            orderBy: {
                flashCard: { createdAt: 'asc' },
            },
        });

        // Track usage if first page is accessed
        if (pageNum === 1 && user.id) {
            await this.prisma.flashCardViewHistory
                .create({
                    data: {
                        id: this.generateIdService.generateId(),
                        userId: user.id,
                        flashCardSetId: id,
                    },
                })
                .catch(() => {});
        }

        const flashCards = detailsFlashCards.map((detail) => detail.flashCard);

        return {
            flashCards,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitNum),
            },
        };
    }

    async deleteFlashcardSet(id: string, user: AuthUser) {
        // Check ownership
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id, userId: user.id },
            cache: false,
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        // Hard delete + R2 cleanup task in ONE tx: the thumbnail is queued if and
        // only if the row is gone (the worker deletes it, with retry).
        await this.prisma.$transaction(async (tx) => {
            // The key comes from the row deleted inside this tx, and is queued only
            // when it is the owner's own object that no other row still uses.
            const deleted = await this.flashcardSetRepository.delete(id, user.id, tx);
            const key = await thumbnailKeyToDelete(
                deleted.thumbnail,
                THUMBNAIL_AREA,
                user.id,
                (url) =>
                    tx.flashCardSet.count({
                        where: { userId: user.id, thumbnail: url },
                    })
            );
            await this.r2Deletes.enqueue(tx, [key]);
        });
        await this.flashcardSetRepository.invalidateWrite('DELETE', id, user.id);

        return { message: 'Xóa bộ thẻ ghi nhớ thành công' };
    }

    async getFlashcardSetPublicById(id: string, userId?: string) {
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id, isPublic: true },
            include: {
                detailsFlashCard: {
                    include: {
                        flashCard: true,
                    },
                },
            },
            cache: true,
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        // Track usage if userId is provided
        if (userId) {
            await this.prisma.flashCardViewHistory
                .create({
                    data: {
                        id: this.generateIdService.generateId(),
                        userId: userId,
                        flashCardSetId: id,
                    },
                })
                .catch(() => {});
        }

        const { detailsFlashCard, ...flashcardSetData } = flashcardSet as any;
        return toFlashcardSetPublicView(
            flashcardSetData,
            detailsFlashCard.map((detail: any) => detail.flashCard)
        );
    }

    async getFlashcardSets(user: AuthUser, dto: GetFlashcardsetsDto) {
        const where: any = {
            userId: user.id,
        };

        if (dto.search) {
            where.OR = [
                { title: { contains: dto.search, mode: 'insensitive' } },
                { description: { contains: dto.search, mode: 'insensitive' } },
            ];
        }

        if (dto.tag && dto.tag.length > 0) {
            where.tag = { hasSome: dto.tag };
        }

        if (dto.isPublic !== undefined) {
            where.isPublic = dto.isPublic;
        }

        if (dto.isPinned !== undefined) {
            where.isPinned = dto.isPinned;
        }

        // Use repository pagination with cache
        const result = await this.flashcardSetRepository.paginate(
            {
                page: dto.page || 1,
                size: dto.limit || 10,
                ...where,
                include: {
                    _count: { select: { detailsFlashCard: true } },
                },
                sortBy: 'createdAt',
                sortType: 'desc',
                cache: true,
            },
            user.id
        );

        // Transform 'tag' to 'tags' for all flashcard sets
        const transformedData = (result.data as any[]).map((fs) => {
            const { tag, ...rest } = fs;
            return { ...rest, tags: tag };
        });

        return {
            flashcardSets: transformedData,
            total: result.total,
            page: result.page,
            limit: result.size,
            totalPages: result.totalPages,
        };
    }

    async updateFlashcardSet(
        id: string,
        user: AuthUser,
        dto: UpdateFlashcardSetDto,
        thumbnailFile?: Express.Multer.File
    ) {
        try {
            // Check ownership
            const flashcardSet = await this.flashcardSetRepository.findOne({
                where: { id, userId: user.id },
                cache: false,
            });

            if (!flashcardSet) {
                throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
            }

            assertThumbnailAllowed(
                dto.thumbnail,
                THUMBNAIL_AREA,
                user.id,
                flashcardSet.thumbnail
            );

            // Handle thumbnail upload if file is provided
            let thumbnailUrl = dto.thumbnail;
            let thumbnailReplaced = false;
            if (
                thumbnailFile &&
                thumbnailFile.buffer &&
                thumbnailFile.buffer.length > 0
            ) {
                const fileName = `${this.generateIdService.generateId()}-${sanitizeFilename(thumbnailFile.originalname)}`;
                const r2Key = await this.r2Service.uploadFile(
                    fileName,
                    thumbnailFile.buffer,
                    thumbnailFile.mimetype,
                    ownerKeyFolder(THUMBNAIL_AREA, user.id),
                    buildMetadata()
                );
                thumbnailUrl = this.r2Service.getPublicUrl(r2Key);

                // The old object is queued with the row update below (same tx).
                thumbnailReplaced = true;
            } else if (thumbnailFile) {
                // File was sent but is empty - keep existing thumbnail
                console.warn(
                    'Thumbnail file was sent but has no content, keeping existing thumbnail'
                );
                thumbnailUrl = flashcardSet.thumbnail || undefined;
            }

            // Update using repository
            // Note: DTO is already parsed in controller
            await this.prisma.$transaction(async (tx) => {
                // The replaced object is read inside the tx, not from the pre-tx fetch.
                const before = thumbnailReplaced
                    ? await tx.flashCardSet.findUnique({
                          where: { id },
                          select: { thumbnail: true },
                      })
                    : null;
                await this.flashcardSetRepository.update(
                    id,
                    {
                        ...(dto.title && { title: dto.title }),
                        ...(dto.description !== undefined && {
                            description: dto.description,
                        }),
                        ...(dto.isPublic !== undefined && {
                            isPublic: dto.isPublic,
                        }),
                        ...(dto.isPinned !== undefined && {
                            isPinned: dto.isPinned,
                        }),
                        ...(dto.tags !== undefined && { tag: dto.tags }),
                        ...(thumbnailUrl !== undefined &&
                            thumbnailUrl !== '' && {
                                thumbnail: thumbnailUrl,
                            }),
                    },
                    user.id,
                    tx
                );
                const oldThumbnailKey = await thumbnailKeyToDelete(
                    before?.thumbnail,
                    THUMBNAIL_AREA,
                    user.id,
                    (url) =>
                        tx.flashCardSet.count({
                            where: { userId: user.id, thumbnail: url },
                        })
                );
                await this.r2Deletes.enqueue(tx, [oldThumbnailKey]);
            });
            await this.flashcardSetRepository.invalidateWrite('UPDATE', id, user.id);

            // Fetch updated flashcardset with _count for consistent response with list endpoint
            const updatedFlashcardSet =
                await this.prisma.flashCardSet.findUnique({
                    where: { id },
                    include: {
                        _count: { select: { detailsFlashCard: true } },
                    },
                });

            // Transform 'tag' to 'tags' for frontend compatibility
            const { tag, ...rest } = updatedFlashcardSet as any;
            return {
                message: 'Cập nhật bộ thẻ ghi nhớ thành công',
                flashcardSet: {
                    ...rest,
                    tags: tag,
                },
            };
        } catch (error) {
            rethrowKnown(error);
            console.log('Error updating flashcard set:', error);
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new InternalServerErrorException(
                'Cập nhật bộ thẻ ghi nhớ thất bại'
            );
        }
    }

    async setFlashcardsToFlashcardSet(
        user: AuthUser,
        dto: SetFlashcardToFlashcardsetDto
    ) {
        try {
            const result = await this.prisma.$transaction(async (tx) => {
                const flashcardSets = await tx.flashCardSet.findMany({
                    where: {
                        id: { in: dto.flashcardsetIds },
                        userId: user.id,
                    },
                    select: { id: true },
                });

                if (flashcardSets.length === 0) {
                    throw new NotFoundException(
                        'Không tìm thấy bộ thẻ ghi nhớ nào'
                    );
                }

                if (flashcardSets.length !== dto.flashcardsetIds.length) {
                    throw new NotFoundException(
                        'Một số bộ thẻ ghi nhớ không tồn tại hoặc không thuộc về bạn'
                    );
                }

                const flashcardSetIds = flashcardSets.map((fs) => fs.id);

                const createdFlashcards = await Promise.all(
                    dto.flashcards.map(async (flashcard) => {
                        const flashcardId = this.generateIdService.generateId();

                        await tx.flashCard.create({
                            data: {
                                id: flashcardId,
                                question: flashcard.question,
                                answer: flashcard.answer,
                            },
                        });

                        await Promise.all(
                            flashcardSetIds.map((flashcardSetId) =>
                                tx.detailsFlashCard.create({
                                    data: {
                                        id: this.generateIdService.generateId(),
                                        flashCardSetId: flashcardSetId,
                                        flashCardId: flashcardId,
                                    },
                                })
                            )
                        );

                        return flashcardId;
                    })
                );

                return {
                    createdFlashcardsCount: createdFlashcards.length,
                    affectedFlashcardSetsCount: flashcardSetIds.length,
                    affectedFlashcardSetIds: flashcardSetIds,
                };
            });

            // Invalidate caches
            await this.flashcardSetRepository.invalidateUserListCache(user.id);
            for (const id of result.affectedFlashcardSetIds) {
                await this.flashcardSetRepository.invalidateItemCache(
                    user.id,
                    id
                );
            }

            return {
                message: `Thêm ${result.createdFlashcardsCount} thẻ ghi nhớ vào ${result.affectedFlashcardSetsCount} bộ thẻ ghi nhớ thành công`,
                createdCount: result.createdFlashcardsCount,
                affectedFlashcardSets: result.affectedFlashcardSetsCount,
            };
        } catch (error) {
            rethrowKnown(error);
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new InternalServerErrorException(
                'Thêm thẻ ghi nhớ vào bộ thẻ ghi nhớ thất bại'
            );
        }
    }

    /**
     * Lưu flashcards từ HistoryGeneratedFlashcard vào FlashCardSet
     * - Optimized với batch operations và hash-based deduplication
     * - Check duplicate theo nội dung flashcard (question + answer)
     */
    async saveHistoryToFlashcardSet(
        user: AuthUser,
        dto: SaveHistoryToFlashcardsetDto
    ) {
        try {
            // Validate input
            if (!dto.flashcardsetIds || dto.flashcardsetIds.length === 0) {
                throw new BadRequestException(
                    'Flashcardset IDs không được để trống'
                );
            }

            if (!dto.historyId) {
                throw new BadRequestException('History ID không được để trống');
            }

            const result = await this.prisma.$transaction(async (tx) => {
                // Validate flashcardSets thuộc về user
                const flashcardSets = await tx.flashCardSet.findMany({
                    where: {
                        id: { in: dto.flashcardsetIds },
                        userId: user.id,
                    },
                    select: { id: true },
                });

                if (flashcardSets.length === 0) {
                    throw new NotFoundException(
                        'Không tìm thấy bộ thẻ ghi nhớ nào'
                    );
                }

                if (flashcardSets.length !== dto.flashcardsetIds.length) {
                    throw new NotFoundException(
                        'Một số bộ thẻ ghi nhớ không tồn tại hoặc không thuộc về bạn'
                    );
                }

                // Validate history record thuộc về user
                // Support both historyId (id field) and userStorageId for backward compatibility
                const history = await tx.historyGeneratedFlashcard.findFirst({
                    where: {
                        OR: [
                            { id: dto.historyId },
                            { userStorageId: dto.historyId },
                        ],
                        userId: user.id,
                    },
                });

                if (!history) {
                    throw new NotFoundException(
                        'Không tìm thấy history hoặc không thuộc về bạn'
                    );
                }

                // Parse flashcards array từ JSON field
                const flashcards = Array.isArray(history.flashcards)
                    ? history.flashcards
                    : [];

                if (flashcards.length === 0) {
                    throw new BadRequestException(
                        'History không có flashcard nào'
                    );
                }

                const flashcardSetIds = flashcardSets.map((fs) => fs.id);

                // Handle label creation/assignment for each flashcardset
                // Create a map of flashcardSetId -> labelId
                const labelMap = new Map<string, string | null>();

                for (const flashcardSetId of flashcardSetIds) {
                    let labelId: string | null = null;

                    // If labelId is provided, validate it belongs to this flashcardset
                    if (dto.labelId) {
                        const existingLabel =
                            await tx.flashCardSetLabel.findFirst({
                                where: {
                                    id: dto.labelId,
                                    flashCardSetId: flashcardSetId,
                                },
                            });
                        if (existingLabel) {
                            labelId = existingLabel.id;
                        }
                    }
                    // If labelName is provided but no labelId, create or find label
                    else if (dto.labelName) {
                        const existingLabel =
                            await tx.flashCardSetLabel.findFirst({
                                where: {
                                    flashCardSetId: flashcardSetId,
                                    name: dto.labelName,
                                },
                            });

                        if (existingLabel) {
                            labelId = existingLabel.id;
                        } else {
                            // Get max order for this flashcardset
                            const maxOrder =
                                await tx.flashCardSetLabel.aggregate({
                                    where: { flashCardSetId: flashcardSetId },
                                    _max: { order: true },
                                });
                            const newOrder = (maxOrder._max.order ?? -1) + 1;

                            const newLabel = await tx.flashCardSetLabel.create({
                                data: {
                                    id: this.generateIdService.generateId(),
                                    flashCardSetId: flashcardSetId,
                                    name: dto.labelName,
                                    color: dto.labelColor,
                                    order: newOrder,
                                },
                            });
                            labelId = newLabel.id;
                        }
                    }

                    labelMap.set(flashcardSetId, labelId);
                }

                const existingFlashcards = await tx.detailsFlashCard.findMany({
                    where: {
                        flashCardSetId: { in: flashcardSetIds },
                    },
                    select: {
                        flashCardSetId: true,
                        flashCardId: true,
                        labelId: true,
                        flashCard: {
                            select: {
                                question: true,
                                answer: true,
                            },
                        },
                    },
                });

                const existingMap = new Map<string, Set<string>>();
                const existingDetailMap = new Map<
                    string,
                    (typeof existingFlashcards)[number]
                >();
                for (const ef of existingFlashcards) {
                    const hash = this.hashFlashcard(
                        ef.flashCard.question,
                        ef.flashCard.answer
                    );
                    if (!existingMap.has(ef.flashCardSetId)) {
                        existingMap.set(ef.flashCardSetId, new Set());
                    }
                    existingMap.get(ef.flashCardSetId)!.add(hash);

                    const detailKey = `${ef.flashCardSetId}|${ef.flashCard.question}|${ef.flashCard.answer}`;
                    if (!existingDetailMap.has(detailKey)) {
                        // Preserve Array.prototype.find's first-match semantics
                        existingDetailMap.set(detailKey, ef);
                    }
                }

                const flashcardsToCreate: any[] = [];
                const detailsToCreate: any[] = [];
                const detailsToUpdate: any[] = []; // For updating labelId of existing flashcards
                const flashcardIdMap = new Map<string, string>(); // hash -> flashcardId

                let skippedCount = 0;
                let updatedCount = 0;

                for (const flashcard of flashcards) {
                    if (
                        !flashcard ||
                        typeof flashcard !== 'object' ||
                        Array.isArray(flashcard)
                    ) {
                        continue;
                    }

                    const flashcardData = flashcard as {
                        question?: string;
                        answer?: string;
                    };

                    const question = flashcardData.question || '';
                    const answer = flashcardData.answer || '';
                    const hash = this.hashFlashcard(question, answer);

                    // Tạo flashcardId một lần cho mỗi unique flashcard
                    if (!flashcardIdMap.has(hash)) {
                        const flashcardId = this.generateIdService.generateId();
                        flashcardIdMap.set(hash, flashcardId);

                        flashcardsToCreate.push({
                            id: flashcardId,
                            question,
                            answer,
                        });
                    }

                    const flashcardId = flashcardIdMap.get(hash)!;

                    for (const flashcardSetId of flashcardSetIds) {
                        const existingSet = existingMap.get(flashcardSetId);
                        const targetLabelId =
                            labelMap.get(flashcardSetId) || null;

                        if (existingSet && existingSet.has(hash)) {
                            // Check if labelId needs to be updated for existing flashcard
                            const existingDetail = existingDetailMap.get(
                                `${flashcardSetId}|${flashcard.question}|${flashcard.answer}`
                            );

                            if (
                                existingDetail &&
                                existingDetail.labelId !== targetLabelId
                            ) {
                                // Update labelId for existing flashcard
                                detailsToUpdate.push({
                                    flashCardSetId: flashcardSetId,
                                    flashCardId: existingDetail.flashCardId,
                                    labelId: targetLabelId,
                                });
                                updatedCount++;
                            } else {
                                skippedCount++;
                            }
                            continue;
                        }

                        detailsToCreate.push({
                            id: this.generateIdService.generateId(),
                            flashCardSetId: flashcardSetId,
                            flashCardId: flashcardId,
                            historyGeneratedFlashcardId: history.id,
                            labelId: targetLabelId,
                        });

                        // Update map để tránh duplicate trong cùng batch
                        if (!existingSet) {
                            existingMap.set(flashcardSetId, new Set([hash]));
                        } else {
                            existingSet.add(hash);
                        }
                    }
                }

                if (
                    flashcardsToCreate.length > 0 &&
                    detailsToCreate.length > 0
                ) {
                    await tx.flashCard.createMany({
                        data: flashcardsToCreate,
                        skipDuplicates: true,
                    });
                }

                if (detailsToCreate.length > 0) {
                    await tx.detailsFlashCard.createMany({
                        data: detailsToCreate,
                        skipDuplicates: true,
                    });
                }

                // Update existing flashcards with new labelId
                // Group by target labelId so each distinct labelId issues a single updateMany
                // instead of one query per (flashCardSetId, flashCardId) pair
                const updatesByLabelId = new Map<
                    string | null,
                    { flashCardSetId: string; flashCardId: string }[]
                >();
                for (const update of detailsToUpdate) {
                    if (!updatesByLabelId.has(update.labelId)) {
                        updatesByLabelId.set(update.labelId, []);
                    }
                    updatesByLabelId.get(update.labelId)!.push({
                        flashCardSetId: update.flashCardSetId,
                        flashCardId: update.flashCardId,
                    });
                }

                for (const [labelId, pairs] of updatesByLabelId) {
                    await tx.detailsFlashCard.updateMany({
                        where: {
                            OR: pairs.map((pair) => ({
                                flashCardSetId: pair.flashCardSetId,
                                flashCardId: pair.flashCardId,
                            })),
                        },
                        data: {
                            labelId,
                        },
                    });
                }

                return {
                    createdCount: detailsToCreate.length,
                    updatedCount,
                    skippedCount,
                    totalFlashcards: flashcards.length,
                    affectedFlashcardSetsCount: flashcardSetIds.length,
                    affectedFlashcardSetIds: flashcardSetIds,
                };
            });

            // Invalidate caches
            await this.flashcardSetRepository.invalidateUserListCache(user.id);
            for (const id of result.affectedFlashcardSetIds) {
                await this.flashcardSetRepository.invalidateItemCache(
                    user.id,
                    id
                );
            }

            return {
                message: `Đã lưu ${result.createdCount} thẻ ghi nhớ vào ${result.affectedFlashcardSetsCount} bộ thẻ ghi nhớ${result.updatedCount > 0 ? ` (${result.updatedCount} đã cập nhật nhãn)` : ''}${result.skippedCount > 0 ? ` (${result.skippedCount} bỏ qua do trùng lặp)` : ''}`,
                createdCount: result.createdCount,
                updatedCount: result.updatedCount,
                skippedCount: result.skippedCount,
                affectedFlashcardSets: result.affectedFlashcardSetsCount,
            };
        } catch (error) {
            rethrowKnown(error);
            console.log('Error in saveHistoryToFlashcardSet:', error);
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException
            ) {
                throw error;
            }
            throw new InternalServerErrorException(
                'Lưu thẻ ghi nhớ từ history thất bại'
            );
        }
    }

    private hashFlashcard(question: string, answer: string): string {
        const normalized = `${question.trim().toLowerCase()}|||${answer.trim().toLowerCase()}`;
        return normalized;
    }

    // ==================== FLASHCARD CRUD METHODS ====================

    /**
     * Thêm flashcard vào flashcardset
     */
    async addFlashcardToFlashcardSet(
        flashcardSetId: string,
        user: AuthUser,
        dto: { question: string; answer: string }
    ) {
        // Check ownership
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id: flashcardSetId, userId: user.id },
            cache: false,
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        const flashcardId = this.generateIdService.generateId();

        const flashcard = await this.prisma.$transaction(async (tx) => {
            // Create flashcard
            const newFlashcard = await tx.flashCard.create({
                data: {
                    id: flashcardId,
                    question: dto.question,
                    answer: dto.answer,
                },
            });

            // Create detail link
            await tx.detailsFlashCard.create({
                data: {
                    id: this.generateIdService.generateId(),
                    flashCardSetId: flashcardSetId,
                    flashCardId: flashcardId,
                },
            });

            return newFlashcard;
        });

        // Invalidate all flashcardset caches including paginate caches
        await this.flashcardSetRepository.invalidateCache();

        return {
            message: 'Thêm thẻ ghi nhớ thành công',
            flashcard,
        };
    }

    /**
     * Cập nhật flashcard trong flashcardset
     */
    async updateFlashcardInFlashcardSet(
        flashcardSetId: string,
        flashcardId: string,
        user: AuthUser,
        dto: { question?: string; answer?: string }
    ) {
        // Check ownership of flashcardset
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id: flashcardSetId, userId: user.id },
            cache: false,
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        // Check if flashcard belongs to this flashcardset
        const detailLink = await this.prisma.detailsFlashCard.findFirst({
            where: {
                flashCardSetId: flashcardSetId,
                flashCardId: flashcardId,
            },
        });

        if (!detailLink) {
            throw new NotFoundException(
                'Thẻ ghi nhớ không tồn tại trong bộ này'
            );
        }

        // Update flashcard
        const updatedFlashcard = await this.prisma.flashCard.update({
            where: { id: flashcardId },
            data: {
                ...(dto.question && { question: dto.question }),
                ...(dto.answer && { answer: dto.answer }),
            },
        });

        // Invalidate all flashcardset caches including paginate caches
        await this.flashcardSetRepository.invalidateCache();

        return {
            message: 'Cập nhật thẻ ghi nhớ thành công',
            flashcard: updatedFlashcard,
        };
    }

    /**
     * Xóa flashcard khỏi flashcardset
     */
    async deleteFlashcardFromFlashcardSet(
        flashcardSetId: string,
        flashcardId: string,
        user: AuthUser
    ) {
        // Check ownership of flashcardset
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id: flashcardSetId, userId: user.id },
            cache: false,
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        // Check if flashcard belongs to this flashcardset
        const detailLink = await this.prisma.detailsFlashCard.findFirst({
            where: {
                flashCardSetId: flashcardSetId,
                flashCardId: flashcardId,
            },
        });

        if (!detailLink) {
            throw new NotFoundException(
                'Thẻ ghi nhớ không tồn tại trong bộ này'
            );
        }

        // Delete the link (not the flashcard itself)
        await this.prisma.detailsFlashCard.delete({
            where: { id: detailLink.id },
        });

        // Invalidate all flashcardset caches including paginate caches
        await this.flashcardSetRepository.invalidateCache();

        return {
            message: 'Xóa thẻ ghi nhớ thành công',
        };
    }

    // ==================== SHARING & ACCESS METHODS ====================

    /**
     * Get access info for a flashcard set (public endpoint)
     * O(1) query with indexed accessCode field
     */
    async checkAccess(id: string, userId?: string) {
        const flashcardSet = await this.prisma.flashCardSet.findUnique({
            where: { id },
            select: {
                id: true,
                isPublic: true,
                userId: true,
                accessCode: true,
                whitelist: true,
                codeGrantedIds: true,
            },
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        const kind = accessKindOf(flashcardSet, userId);
        if (kind) return { hasAccess: true, accessType: kind };

        // Code required
        if (flashcardSet.accessCode) {
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
     * Verify the access code of a set. Auth is required (see the controller),
     * and the attempt counter lives per set and user in `access-code-guard`.
     */
    async verifyAccessCode(id: string, accessCode: unknown, userId: string) {
        const flashcardSet = await this.prisma.flashCardSet.findUnique({
            where: { id },
            select: { accessCode: true },
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        await verifyAccessCodeOrThrow(this.redis.getClient(), {
            resourceId: id,
            userId,
            stored: flashcardSet.accessCode,
            given: accessCode,
        });

        return {
            valid: true,
            message: 'Mã xác thực hợp lệ',
        };
    }

    /**
     * Get flashcard set for study (public | owner | whitelist). A caller with
     * no grant gets 404 (no existence leak); a code-protected set asks for the code.
     */
    async getFlashcardSetForStudy(id: string, userId: string) {
        const accessInfo = await this.checkAccess(id, userId);

        if (accessInfo.accessType === 'code_required') {
            throw new ForbiddenException({
                statusCode: 403,
                code: 'CODE_REQUIRED',
                message: 'Yêu cầu mã truy cập',
            });
        }
        if (!accessInfo.hasAccess) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        return this.loadStudyView(id, userId);
    }

    /**
     * Get flashcard set after code verification. A valid code is remembered
     * (`codeGrantedIds`) until the code changes, so the next visit skips it.
     */
    async getFlashcardSetWithCode(id: string, accessCode: unknown, userId: string) {
        await this.verifyAccessCode(id, accessCode, userId);
        await appendCodeGranted(this.prisma, 'FlashCardSet', id, userId, String(accessCode));
        return this.loadStudyView(id, userId);
    }

    /** Counts the view, records history and returns the answer-safe study payload. */
    private async loadStudyView(id: string, userId: string) {
        const flashcardSet = await this.prisma.flashCardSet.update({
            where: { id },
            data: { viewCount: { increment: 1 } },
            include: {
                detailsFlashCard: {
                    include: {
                        flashCard: true,
                    },
                },
            },
        });

        // the owner's cached reads carry viewCount
        await this.flashcardSetRepository.invalidateItemCache(
            flashcardSet.userId,
            id
        );

        await this.prisma.flashCardViewHistory
            .create({
                data: {
                    id: this.generateIdService.generateId(),
                    userId,
                    flashCardSetId: id,
                },
            })
            .catch((err) =>
                console.error('Failed to record flashcard view history:', err)
            );

        return toFlashcardSetStudyView(
            flashcardSet,
            flashcardSet.detailsFlashCard.map((detail) => detail.flashCard),
            (await this.users.withUser(flashcardSet)).user
        );
    }

    /**
     * Get public info for a flashcard set (without flashcards)
     */
    async getFlashcardSetPublicInfo(id: string) {
        const flashcardSet = await this.prisma.flashCardSet.findUnique({
            where: { id },
            select: {
                id: true,
                title: true,
                description: true,
                thumbnail: true,
                viewCount: true,
                isPublic: true,
                accessCode: true,
                createdAt: true,
                userId: true,
                _count: {
                    select: { detailsFlashCard: true },
                },
            },
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        return {
            id: flashcardSet.id,
            title: flashcardSet.title,
            description: flashcardSet.description,
            thumbnail: flashcardSet.thumbnail,
            viewCount: flashcardSet.viewCount,
            cardCount: flashcardSet._count.detailsFlashCard,
            creator: (await this.users.withUser(flashcardSet)).user,
            createdAt: flashcardSet.createdAt.toISOString(),
            isPublic: flashcardSet.isPublic,
            requiresCode: !flashcardSet.isPublic && !!flashcardSet.accessCode,
        };
    }

    /**
     * Apply a sharing delta (add/remove users, visibility, code on/off) in ONE
     * atomic statement; removing a user also revokes a code unlock.
     */
    async updateSharingSettings(
        id: string,
        user: AuthUser,
        dto: FlashcardSetUpdateSharingSettingsDto
    ) {
        const input = await prepareSharingUpdate(
            this.users,
            id,
            user.id,
            dto,
            generateAccessCode()
        );
        const row = await applySharingUpdate(this.prisma, 'FlashCardSet', input);
        await this.flashcardSetRepository.invalidateItemCache(user.id, id);
        return toSharingView(this.users, row);
    }

    /**
     * New access code for the owner's set. Only the code changes: the whitelist
     * and the visibility are kept, and everyone who unlocked with the old code
     * loses access (`codeGrantedIds` is cleared in the same update).
     */
    async regenerateAccessCode(id: string, user: AuthUser) {
        const accessCode = generateAccessCode();
        const { count } = await this.prisma.flashCardSet.updateMany({
            where: { id, userId: user.id },
            data: { accessCode, codeGrantedIds: [] },
        });
        if (count === 0) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }
        await this.flashcardSetRepository.invalidateItemCache(user.id, id);
        return { accessCode };
    }

    /** Sharing view for the owner: whitelist and code-granted users in one batch lookup (no email). */
    async getSharingSettings(id: string, user: AuthUser) {
        const flashcardSet = await this.prisma.flashCardSet.findFirst({
            where: { id, userId: user.id },
            select: {
                isPublic: true,
                accessCode: true,
                whitelist: true,
                codeGrantedIds: true,
            },
        });
        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }
        return toSharingView(this.users, flashcardSet);
    }

    /**
     * Get all labels for a flashcard set
     */
    async getLabels(flashcardSetId: string, user: AuthUser) {
        // Check ownership
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id: flashcardSetId, userId: user.id },
            cache: true,
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        const labels = await this.prisma.flashCardSetLabel.findMany({
            where: { flashCardSetId: flashcardSetId },
            include: {
                _count: {
                    select: { detailsFlashCards: true },
                },
            },
            orderBy: { order: 'asc' },
        });

        // Also get count of unlabeled flashcards
        const unlabeledCount = await this.prisma.detailsFlashCard.count({
            where: { flashCardSetId: flashcardSetId, labelId: null },
        });

        return {
            labels: labels.map((l) => ({
                ...l,
                flashcardCount: l._count.detailsFlashCards,
            })),
            unlabeledCount,
        };
    }

    /**
     * Create a new label for a flashcard set
     */
    async createLabel(
        flashcardSetId: string,
        user: AuthUser,
        dto: CreateFlashcardLabelDto
    ) {
        // Check ownership
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id: flashcardSetId, userId: user.id },
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        const label = await this.prisma.flashCardSetLabel.create({
            data: {
                flashCardSetId: flashcardSetId,
                name: dto.name,
                description: dto.description,
                color: dto.color,
                order: dto.order || 0,
            },
        });

        await this.flashcardSetRepository.invalidateItemCache(user.id, flashcardSetId);
        await this.flashcardSetRepository.invalidateUserListCache(user.id);

        return { label };
    }

    /**
     * Update a label
     */
    async updateLabel(
        flashcardSetId: string,
        labelId: string,
        user: AuthUser,
        dto: UpdateFlashcardLabelDto
    ) {
        // Check ownership
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id: flashcardSetId, userId: user.id },
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        const label = await this.prisma.flashCardSetLabel.findFirst({
            where: { id: labelId, flashCardSetId: flashcardSetId },
        });

        if (!label) {
            throw new NotFoundException('Nhãn không tồn tại');
        }

        const updatedLabel = await this.prisma.flashCardSetLabel.update({
            where: { id: labelId },
            data: {
                name: dto.name,
                description: dto.description,
                color: dto.color,
                order: dto.order,
            },
        });

        await this.flashcardSetRepository.invalidateItemCache(user.id, flashcardSetId);
        await this.flashcardSetRepository.invalidateUserListCache(user.id);

        return { label: updatedLabel };
    }

    /**
     * Delete a label
     */
    async deleteLabel(flashcardSetId: string, labelId: string, user: AuthUser) {
        // Check ownership
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id: flashcardSetId, userId: user.id },
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        const label = await this.prisma.flashCardSetLabel.findFirst({
            where: { id: labelId, flashCardSetId: flashcardSetId },
        });

        if (!label) {
            throw new NotFoundException('Nhãn không tồn tại');
        }

        // Remove label from all flashcards
        await this.prisma.detailsFlashCard.updateMany({
            where: { labelId },
            data: { labelId: null },
        });

        // Delete the label
        await this.prisma.flashCardSetLabel.delete({
            where: { id: labelId },
        });

        await this.flashcardSetRepository.invalidateItemCache(user.id, flashcardSetId);
        await this.flashcardSetRepository.invalidateUserListCache(user.id);

        return { message: 'Nhãn đã được xóa thành công' };
    }

    /**
     * Assign flashcards to a label
     */
    async assignFlashcardsToLabel(
        flashcardSetId: string,
        labelId: string,
        user: AuthUser,
        flashcardIds: string[]
    ) {
        // Check ownership
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id: flashcardSetId, userId: user.id },
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        const label = await this.prisma.flashCardSetLabel.findFirst({
            where: { id: labelId, flashCardSetId: flashcardSetId },
        });

        if (!label) {
            throw new NotFoundException('Nhãn không tồn tại');
        }

        // Verify all flashcards belong to this flashcard set
        const flashcards = await this.prisma.detailsFlashCard.findMany({
            where: {
                id: { in: flashcardIds },
                flashCardSetId: flashcardSetId,
            },
        });

        if (flashcards.length !== flashcardIds.length) {
            throw new BadRequestException(
                'Một số thẻ ghi nhớ không tồn tại hoặc không thuộc bộ này'
            );
        }

        // Assign label to flashcards
        await this.prisma.detailsFlashCard.updateMany({
            where: { id: { in: flashcardIds } },
            data: { labelId },
        });

        await this.flashcardSetRepository.invalidateItemCache(user.id, flashcardSetId);
        await this.flashcardSetRepository.invalidateUserListCache(user.id);

        return { message: 'Thẻ ghi nhớ đã được gán nhãn thành công' };
    }

    /**
     * Remove flashcards from a label
     */
    async removeFlashcardsFromLabel(
        flashcardSetId: string,
        labelId: string,
        user: AuthUser,
        flashcardIds: string[]
    ) {
        // Check ownership
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id: flashcardSetId, userId: user.id },
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        const label = await this.prisma.flashCardSetLabel.findFirst({
            where: { id: labelId, flashCardSetId: flashcardSetId },
        });

        if (!label) {
            throw new NotFoundException('Nhãn không tồn tại');
        }

        // Remove label from flashcards
        await this.prisma.detailsFlashCard.updateMany({
            where: { id: { in: flashcardIds } },
            data: { labelId: null },
        });

        await this.flashcardSetRepository.invalidateItemCache(user.id, flashcardSetId);
        await this.flashcardSetRepository.invalidateUserListCache(user.id);

        return { message: 'Đã gỡ nhãn khỏi thẻ ghi nhớ thành công' };
    }

    /**
     * Get flashcards by label
     */
    async getFlashcardsByLabel(
        flashcardSetId: string,
        labelId: string,
        user: AuthUser,
        query: any
    ) {
        // Check ownership
        const flashcardSet = await this.flashcardSetRepository.findOne({
            where: { id: flashcardSetId, userId: user.id },
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ thẻ ghi nhớ không tồn tại');
        }

        const label = await this.prisma.flashCardSetLabel.findFirst({
            where: { id: labelId, flashCardSetId: flashcardSetId },
        });

        if (!label) {
            throw new NotFoundException('Nhãn không tồn tại');
        }

        const page = query.page || 1;
        const limit = query.limit || 10;
        const skip = (page - 1) * limit;

        const [flashcards, total] = await Promise.all([
            this.prisma.detailsFlashCard.findMany({
                where: { flashCardSetId: flashcardSetId, labelId },
                include: {
                    flashCard: true,
                    label: true,
                },
                skip,
                take: limit,
                orderBy: { id: 'asc' },
            }),
            this.prisma.detailsFlashCard.count({
                where: { flashCardSetId: flashcardSetId, labelId },
            }),
        ]);

        const flashCards = flashcards.map((detail) => ({
            ...detail.flashCard,
            label: detail.label,
        }));

        return {
            flashCards: flashCards,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async generateShareLink(flashcardSetId: string, user: any) {
        // Owner only (public or private); anyone else sees "not found".
        const flashcardSet = await this.prisma.flashCardSet.findFirst({
            where: { id: flashcardSetId, userId: user.id },
        });

        if (!flashcardSet) {
            throw new NotFoundException('Bộ flashcard không tồn tại');
        }

        // Generate 6-digit access code if not exists
        let accessCode = flashcardSet.accessCode;
        if (!accessCode) {
            accessCode = this.generateIdService.generate6DigitCode();
            await this.prisma.flashCardSet.update({
                where: { id: flashcardSetId },
                data: { accessCode },
            });
        }

        // Generate share URL
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const shareUrl = `${baseUrl}/study-flashcard/${flashcardSetId}`;

        await this.flashcardSetRepository.invalidateItemCache(user.id, flashcardSetId);
        await this.flashcardSetRepository.invalidateUserListCache(user.id);

        return {
            shareUrl,
            accessCode,
        };
    }
}
