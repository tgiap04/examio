import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';

export interface NewMessage {
    id: string;
    chatId: string;
    role: 'user' | 'assistant';
    content: string;
    imageUrl?: string;
    documentId?: string;
    documentName?: string;
}

@Injectable()
export class AIChatMessageRepository {
    constructor(private readonly prisma: PrismaService) {}

    findByChat(chatId: string) {
        return this.prisma.aIChatMessage.findMany({ where: { chatId }, orderBy: { createdAt: 'asc' } });
    }

    /** The most recent `limit` messages in chronological order (AI context without the whole history). */
    async findRecent(chatId: string, limit: number) {
        const messages = await this.prisma.aIChatMessage.findMany({
            where: { chatId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return messages.reverse();
    }

    findById(messageId: string) {
        return this.prisma.aIChatMessage.findUnique({ where: { id: messageId } });
    }

    /** Creates the message and bumps the chat's `updatedAt` in one transaction. */
    create(data: NewMessage) {
        return this.prisma.$transaction(async (tx) => {
            const message = await tx.aIChatMessage.create({ data });
            await tx.aIChat.update({ where: { id: data.chatId }, data: { updatedAt: new Date() } });
            return message;
        });
    }

    updateContent(messageId: string, content: string) {
        return this.prisma.aIChatMessage.update({ where: { id: messageId }, data: { content } });
    }

    countUserMessagesSince(userId: string, since: Date) {
        return this.prisma.aIChatMessage.count({
            where: { role: 'user', createdAt: { gt: since }, chat: { userId } },
        });
    }

    countUserMessagesInChat(chatId: string) {
        return this.prisma.aIChatMessage.count({ where: { chatId, role: 'user' } });
    }
}
