import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '../../prisma';

type Db = PrismaService | Prisma.TransactionClient;

/** The fields of a subject that may reach a client (never `systemPrompt`). */
export const SUBJECT_PUBLIC_SELECT = {
    id: true,
    name: true,
    slug: true,
    icon: true,
    color: true,
} as const;

@Injectable()
export class AIChatRepository {
    constructor(private readonly prisma: PrismaService) {}

    findByUser(userId: string) {
        return this.prisma.aIChat.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
            include: {
                messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true } },
                subject: { select: SUBJECT_PUBLIC_SELECT },
                _count: { select: { messages: true } },
            },
        });
    }

    findById(chatId: string) {
        return this.prisma.aIChat.findUnique({
            where: { id: chatId },
            include: { subject: { select: SUBJECT_PUBLIC_SELECT } },
        });
    }

    create(data: { id: string; userId: string; title: string; subjectId: string | null }) {
        return this.prisma.aIChat.create({ data });
    }

    updateTitle(chatId: string, title: string) {
        return this.prisma.aIChat.update({ where: { id: chatId }, data: { title, updatedAt: new Date() } });
    }

    /** True only for the caller's own chat. */
    async existsForUser(chatId: string, userId: string): Promise<boolean> {
        return (await this.prisma.aIChat.count({ where: { id: chatId, userId } })) > 0;
    }

    findSubject(subjectId: string) {
        return this.prisma.subject.findUnique({ where: { id: subjectId }, select: SUBJECT_PUBLIC_SELECT });
    }

    /** The AI teacher's prompt. Internal: it is handed to ai-service and never returned to a client. */
    async findSubjectPrompt(subjectId: string): Promise<string | null> {
        const subject = await this.prisma.subject.findUnique({ where: { id: subjectId }, select: { systemPrompt: true } });
        return subject?.systemPrompt ?? null;
    }

    // ==================== DOCUMENT LINKS ====================

    findDocuments(chatId: string) {
        return this.prisma.aIChatDocument.findMany({
            where: { chatId },
            select: { documentId: true, documentName: true },
            orderBy: { createdAt: 'asc' },
        });
    }

    upsertDocument(data: { chatId: string; documentId: string; documentName: string }) {
        return this.prisma.aIChatDocument.upsert({
            where: { chatId_documentId: { chatId: data.chatId, documentId: data.documentId } },
            update: { documentName: data.documentName },
            create: data,
        });
    }

    removeDocument(chatId: string, documentId: string) {
        return this.prisma.aIChatDocument.deleteMany({ where: { chatId, documentId } });
    }

    async documentIds(chatId: string): Promise<string[]> {
        const links = await this.prisma.aIChatDocument.findMany({ where: { chatId }, select: { documentId: true } });
        return links.map((link) => link.documentId);
    }

    /** `document.deleted`: drops the links of deleted documents (in the consumer's tx). Returns how many rows went. */
    async deleteLinksOfDocuments(db: Db, documentIds: string[]): Promise<number> {
        const { count } = await db.aIChatDocument.deleteMany({ where: { documentId: { in: documentIds } } });
        return count;
    }
}
