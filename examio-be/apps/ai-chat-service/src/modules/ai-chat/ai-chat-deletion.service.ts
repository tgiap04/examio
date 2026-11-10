import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ownedR2KeyFromUrl } from '@examio/common';
import { R2DeleteTaskWriter } from '@examio/messaging';
import type { AuthUser } from '@examio/auth-jwt';
import { MESSAGE_IMAGE_AREAS } from '../../config/ai-chat.constants';
import { PrismaService } from '../../prisma';
import { AIChatRepository } from './ai-chat.repository';
import { AIChatDocumentsService } from './ai-chat-documents.service';
import { ChatAccessService } from './chat-access.service';

/**
 * Everything that deletes chat rows. A message image on R2 is never deleted here: its key is queued in
 * `r2_delete_tasks` in the SAME transaction as the row delete (so the task exists if and only if the
 * delete committed) and the worker role drains the table.
 */
@Injectable()
export class AIChatDeletionService {
    private readonly logger = new Logger(AIChatDeletionService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly chats: AIChatRepository,
        private readonly access: ChatAccessService,
        private readonly documents: AIChatDocumentsService,
        private readonly r2Deletes: R2DeleteTaskWriter
    ) {}

    /** Deletes the chat (messages and document links cascade); its documents are kept. */
    async deleteChat(chatId: string, user: AuthUser) {
        const chat = await this.access.ownedChat(chatId, user);
        await this.removeChat(chat);
        return { success: true, message: 'Chat deleted' };
    }

    /**
     * Deletes the chat; with `deleteFiles` its documents are deleted first in ONE document-service
     * call as the caller. If document-service cannot answer, the chat is kept (503) so a retry deletes
     * both; the call is idempotent (ids already gone are skipped).
     */
    async clearChat(chatId: string, user: AuthUser, deleteFiles: boolean, userToken: string) {
        const chat = await this.access.ownedChat(chatId, user);
        const deletedFiles = deleteFiles
            ? await this.documents.deleteAll(await this.chats.documentIds(chatId), userToken)
            : [];
        await this.removeChat(chat);
        return {
            success: true,
            message: deleteFiles ? 'Chat và files đã được xóa' : 'Chat đã được xóa',
            deletedFiles: deleteFiles ? deletedFiles : undefined,
        };
    }

    async deleteMessage(messageId: string, user: AuthUser) {
        const { message, chat } = await this.access.ownedMessage(messageId, user);
        await this.prisma.$transaction(async (tx) => {
            await this.r2Deletes.enqueue(tx, this.imageKeys([message.imageUrl], chat.userId));
            const { count } = await tx.aIChatMessage.deleteMany({ where: { id: message.id } });
            if (count === 0) throw new NotFoundException('Message not found');
        });
        return { success: true, message: 'Message deleted' };
    }

    /**
     * Regenerate: removes `message` and every later message of its chat. `message` itself is sent
     * again with the same image, so its key is NOT queued; the images of the messages that are gone
     * for good are.
     */
    async deleteFrom(chat: { id: string; userId: string }, message: { id: string; createdAt: Date; imageUrl: string | null }) {
        await this.prisma.$transaction(async (tx) => {
            const doomed = await tx.aIChatMessage.findMany({
                where: { chatId: chat.id, createdAt: { gte: message.createdAt } },
                select: { id: true, imageUrl: true },
            });
            const resent = this.imageKeys([message.imageUrl], chat.userId);
            const keys = this.imageKeys(
                doomed.filter((m) => m.id !== message.id).map((m) => m.imageUrl),
                chat.userId
            ).filter((key) => !resent.includes(key));
            await this.r2Deletes.enqueue(tx, keys);
            await tx.aIChatMessage.deleteMany({ where: { id: { in: doomed.map((m) => m.id) } } });
        });
    }

    private async removeChat(chat: { id: string; userId: string }): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const withImages = await tx.aIChatMessage.findMany({
                where: { chatId: chat.id, imageUrl: { not: null } },
                select: { imageUrl: true },
            });
            await this.r2Deletes.enqueue(tx, this.imageKeys(withImages.map((m) => m.imageUrl), chat.userId));
            const { count } = await tx.aIChat.deleteMany({ where: { id: chat.id } });
            // A concurrent delete won: leave nothing queued for a chat that this call did not remove.
            if (count === 0) throw new NotFoundException('Chat not found');
        });
    }

    /**
     * R2 keys of message images that may be deleted: only objects under the owner's own
     * `images/<ownerId>/` folder, because `imageUrl` is client-supplied and must never let one user
     * delete an object that belongs to someone else or to another feature. External URLs resolve to
     * nothing.
     */
    private imageKeys(urls: ReadonlyArray<string | null>, ownerId: string): string[] {
        const present = urls.filter((url): url is string => Boolean(url));
        if (present.length > 0 && !process.env.R2_PUBLIC_URL) {
            this.logger.warn('R2_PUBLIC_URL is not set: message images cannot be told from external URLs and are not deleted');
        }
        return present.flatMap((url) => {
            const key = ownedR2KeyFromUrl(url, MESSAGE_IMAGE_AREAS, ownerId);
            return key ? [key] : [];
        });
    }
}
