import { Module } from '@nestjs/common';
import { ServiceMetadata } from '@examio/auth-jwt';
import {
    DOCUMENT_GRPC_REGISTRATION,
    DocumentClient,
    FINANCE_GRPC_REGISTRATION,
    FinanceClient,
    GRPC_METADATA_ATTACHER,
    GrpcClientModule,
} from '@examio/grpc';
import { R2DeleteTaskWriter } from '@examio/messaging';
import { AI_GRPC_REGISTRATION, AiClient } from '../../clients/ai.client';
import { AIChatController } from './ai-chat.controller';
import { AIChatRepository } from './ai-chat.repository';
import { AIChatMessageRepository } from './ai-chat-message.repository';
import { AIChatService } from './ai-chat.service';
import { AIChatAnswerService } from './ai-chat-answer.service';
import { AIChatDeletionService } from './ai-chat-deletion.service';
import { AIChatDocumentsService } from './ai-chat-documents.service';
import { AIChatLimitsService } from './ai-chat-limits.service';
import { AIChatStreamService } from './ai-chat-stream.service';
import { AIChatTurnService } from './ai-chat-turn.service';
import { ChatAccessService } from './chat-access.service';
import { DocumentDeletedHandler } from '../events/document-deleted.handler';
import { SubscriptionChangedHandler } from '../events/subscription-changed.handler';

/**
 * AI chat: conversations, messages, attached documents and streaming answers. ai-service is reached
 * as `svc:ai-chat`; document-service and finance are reached AS the caller (forwarded user token).
 * The two event handlers (`document.deleted`, `finance.subscription.changed`) are discovered by the
 * MessagingModule of the root module.
 */
@Module({
    imports: [GrpcClientModule.register(AI_GRPC_REGISTRATION, DOCUMENT_GRPC_REGISTRATION, FINANCE_GRPC_REGISTRATION)],
    controllers: [AIChatController],
    providers: [
        { provide: GRPC_METADATA_ATTACHER, useExisting: ServiceMetadata },
        FinanceClient,
        AiClient,
        DocumentClient,
        R2DeleteTaskWriter,
        AIChatRepository,
        AIChatMessageRepository,
        ChatAccessService,
        AIChatService,
        AIChatLimitsService,
        AIChatDocumentsService,
        AIChatDeletionService,
        AIChatTurnService,
        AIChatAnswerService,
        AIChatStreamService,
        DocumentDeletedHandler,
        SubscriptionChangedHandler,
    ],
})
export class AIChatModule {}
