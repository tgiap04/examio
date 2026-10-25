import { NotFoundException } from '@nestjs/common';
import type { MessageInput } from './ai-chat-turn.service';

/** Only a user message can be regenerated from. */
export function regeneratable(message: { role: string }): void {
    if (message.role !== 'user') throw new NotFoundException('Can only regenerate from user message');
}

/** What is sent again when a user message is regenerated: its content, image and document, as stored. */
export function resend(message: {
    content: string;
    imageUrl: string | null;
    documentId: string | null;
    documentName: string | null;
}): MessageInput {
    return {
        message: message.content,
        imageUrl: message.imageUrl || undefined,
        documentId: message.documentId || undefined,
        documentName: message.documentName || undefined,
    };
}
