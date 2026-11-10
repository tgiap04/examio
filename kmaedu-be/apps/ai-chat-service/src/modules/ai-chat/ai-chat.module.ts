import { Module } from '@nestjs/common';
import {
    DOCUMENT_GRPC_REGISTRATION,
    DocumentClient,
    GrpcClientModule,
} from '@kmaedu/grpc';
import { R2DeleteTaskWriter } from '@kmaedu/messaging';
import { AI_GRPC_REGISTRATION, AiClient } from '../../clients/ai.client';
import { AIChatController } from './ai-chat.controller';
import { AIChatRepository } from './ai-chat.repository';
import { AIChatMessageRepository } from './ai-chat-message.repository';
import { AIChatService } from './ai-chat.service';
import { AIChatAnswerService } from './ai-chat-answer.service';
import { AIChatDeletionService } from './ai-chat-deletion.service';
import { AIChatDocumentsService } from './ai-chat-documents.service';
import { AIChatStreamService } from './ai-chat-stream.service';
import { AIChatTurnService } from './ai-chat-turn.service';
import { ChatAccessService } from './chat-access.service';
import { DocumentDeletedHandler } from '../events/document-deleted.handler';

/**
 * AI chat: conversations, messages, attached documents and streaming answers. ai-service is reached
 * as `svc:ai-chat`; document-service is reached AS the caller (forwarded user token).
 * The `document.deleted` event handler is discovered by the MessagingModule of the root module.
 */
@Module({
    imports: [GrpcClientModule.register(AI_GRPC_REGISTRATION, DOCUMENT_GRPC_REGISTRATION)],
    controllers: [AIChatController],
    providers: [
        AiClient,
        DocumentClient,
        R2DeleteTaskWriter,
        AIChatRepository,
        AIChatMessageRepository,
        ChatAccessService,
        AIChatService,
        AIChatDocumentsService,
        AIChatDeletionService,
        AIChatTurnService,
        AIChatAnswerService,
        AIChatStreamService,
        DocumentDeletedHandler,
    ],
})
export class AIChatModule {}
