import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { Prisma, UserStorage } from '../../prisma';

@Injectable()
export class AIRepository {
    private readonly logger = new Logger(AIRepository.name);

    constructor(private readonly prisma: PrismaService) {}

    async createUserStorage(data: {
        id: string;
        userId: string;
        filename: string;
        url: string;
        mimetype: string;
        size: number;
        keyR2: string;
        processingStatus?: string;
        creditCharged?: boolean;
    }): Promise<UserStorage> {
        const status = data.processingStatus || 'PENDING';
        const creditCharged = data.creditCharged ?? false;
        try {
            return await this.prisma.userStorage.create({
                data: {
                    id: data.id,
                    userId: data.userId,
                    filename: data.filename,
                    url: data.url,
                    mimetype: data.mimetype,
                    size: data.size,
                    keyR2: data.keyR2,
                    processingStatus: status,
                    creditCharged,
                },
            });
        } catch (error) {
            if ((error as { code?: string } | null)?.code !== 'P2002') throw error;
        }

        // keyR2 is unique. A retry of the caller's OWN failed upload resets that row;
        // a key that belongs to anyone else is never touched (409), so one user can
        // not overwrite another user's row by supplying their key.
        const reset = await this.prisma.userStorage.updateMany({
            where: { keyR2: data.keyR2, userId: data.userId },
            data: { processingStatus: status, creditCharged, updatedAt: new Date() },
        });
        if (reset.count === 0) {
            throw new ConflictException('Khóa lưu trữ đã tồn tại');
        }
        return this.prisma.userStorage.findUniqueOrThrow({
            where: { keyR2: data.keyR2 },
        });
    }

    async findUserStorageById(id: string): Promise<UserStorage | null> {
        return this.prisma.userStorage.findUnique({
            where: { id },
        });
    }

    async findUserStorageWithLatestHistories(id: string) {
        return this.prisma.userStorage.findUnique({
            where: { id },
            include: {
                historyGeneratedQuizz: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
                historyGeneratedFlashcard: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });
    }

    async findUserStoragesByUserId(
        userId: string,
        options?: { page?: number; size?: number }
    ) {
        const page = options?.page || 1;
        const size = options?.size || 10;
        const skip = (page - 1) * size;

        const [data, total] = await Promise.all([
            this.prisma.userStorage.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: size,
                include: {
                    // Include latest quiz history to compute summary count
                    historyGeneratedQuizz: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: {
                            id: true,
                            createdAt: true,
                            quizzes: true,
                        },
                    },
                    // Include latest flashcard history to compute summary count
                    historyGeneratedFlashcard: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: {
                            id: true,
                            createdAt: true,
                            flashcards: true,
                        },
                    },
                },
            }),
            this.prisma.userStorage.count({
                where: { userId },
            }),
        ]);

        // Transform data to match FE expected format - include summary counts only
        const transformedData = data.map((item) => {
            const {
                historyGeneratedQuizz,
                historyGeneratedFlashcard,
                ...rest
            } = item;

            const latestQuizHistory = historyGeneratedQuizz?.[0];
            const latestFlashcardHistory = historyGeneratedFlashcard?.[0];
            const latestQuizzes = latestQuizHistory?.quizzes;
            const latestFlashcards = latestFlashcardHistory?.flashcards;

            const quizCount = Array.isArray(latestQuizzes)
                ? latestQuizzes.length
                : 0;
            const flashcardCount = Array.isArray(latestFlashcards)
                ? latestFlashcards.length
                : 0;

            return {
                ...rest,
                quizHistory: latestQuizHistory
                    ? {
                          id: latestQuizHistory.id,
                          createdAt: latestQuizHistory.createdAt,
                          quizCount,
                      }
                    : null,
                flashcardHistory: latestFlashcardHistory
                    ? {
                          id: latestFlashcardHistory.id,
                          createdAt: latestFlashcardHistory.createdAt,
                          flashcardCount,
                      }
                    : null,
            };
        });

        return { data: transformedData, total };
    }

    async updateUserStorageStatus(
        id: string,
        status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
    ): Promise<UserStorage> {
        return this.prisma.userStorage.update({
            where: { id },
            data: { processingStatus: status },
        });
    }

    async deleteUserStorage(id: string): Promise<UserStorage> {
        return this.prisma.userStorage.delete({
            where: { id },
        });
    }

    async deleteQuizHistoriesByUserStorageId(
        userStorageId: string
    ): Promise<{ count: number }> {
        return this.prisma.historyGeneratedQuizz.deleteMany({
            where: { userStorageId },
        });
    }

    async deleteFlashcardHistoriesByUserStorageId(
        userStorageId: string
    ): Promise<{ count: number }> {
        return this.prisma.historyGeneratedFlashcard.deleteMany({
            where: { userStorageId },
        });
    }

    async deleteAiChatDocumentsByUserStorageId(
        userStorageId: string
    ): Promise<{ count: number }> {
        return this.prisma.aIChatDocument.deleteMany({
            where: { documentId: userStorageId },
        });
    }

    /** `inTx` runs in the same transaction (e.g. queues the R2 object for deletion). */
    async deleteUploadAggregate(
        userStorageId: string,
        inTx?: (tx: Prisma.TransactionClient) => Promise<unknown>
    ) {
        return this.prisma.$transaction(async (tx) => {
            const aiChatDocuments = await tx.aIChatDocument.deleteMany({
                where: { documentId: userStorageId },
            });
            const documentEntities = await tx.documentEntity.deleteMany({
                where: { userStorageId },
            });
            const documents = await tx.document.deleteMany({
                where: { userStorageId },
            });
            const userStorage = await tx.userStorage.delete({
                where: { id: userStorageId },
            });
            await inTx?.(tx);

            return {
                aiChatDocuments: aiChatDocuments.count,
                documentEntities: documentEntities.count,
                documents: documents.count,
                userStorage,
            };
        });
    }

    async deleteDocumentsByUserStorageId(
        userStorageId: string
    ): Promise<{ count: number }> {
        return this.prisma.document.deleteMany({
            where: { userStorageId },
        });
    }

    async countDocumentsByUserStorageId(userStorageId: string): Promise<number> {
        return this.prisma.document.count({
            where: { userStorageId },
        });
    }

    async markCreditCharged(id: string): Promise<UserStorage> {
        return this.prisma.userStorage.update({
            where: { id },
            data: { creditCharged: true },
        });
    }

    /**
     * Find the latest quiz history for a userStorage
     */
    async findLatestQuizHistory(userStorageId: string) {
        return this.prisma.historyGeneratedQuizz.findFirst({
            where: { userStorageId },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Find the latest flashcard history for a userStorage
     */
    async findLatestFlashcardHistory(userStorageId: string) {
        return this.prisma.historyGeneratedFlashcard.findFirst({
            where: { userStorageId },
            orderBy: { createdAt: 'desc' },
        });
    }
    /**
     * Count how many files a user has uploaded since the start of the
     * current calendar month. Used to enforce the subscription's
     * `filesPerMonth` quota before accepting a new upload.
     */
    async countUserStorageThisMonth(userId: string): Promise<number> {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return this.prisma.userStorage.count({
            where: {
                userId,
                createdAt: { gte: startOfMonth },
            },
        });
    }

    /**
     * Find existing file by name and size to prevent duplicates
     */
    async findDuplicateUserStorage(
        userId: string,
        filename: string,
        size: number
    ): Promise<UserStorage | null> {
        return this.prisma.userStorage.findFirst({
            where: {
                userId,
                filename,
                size,
                // Only consider recent files or ensure exact match
            },
            orderBy: { createdAt: 'desc' },
        });
    }
}
