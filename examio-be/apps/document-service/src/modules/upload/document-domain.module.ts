import { Module } from '@nestjs/common';
import { GenerateIdService } from '@examio/common';
import { GrpcClientModule } from '@examio/grpc';
import { MessagingModule, R2DeleteTaskWriter } from '@examio/messaging';
import { R2_GRPC_REGISTRATION, R2Client } from '../../clients/r2.client';
import { DocumentDeleteService } from './document-delete.service';
import { DocumentProcessingService } from './document-processing.service';
import { DocumentQueryService } from './document-query.service';
import { DocumentQueueService } from './document-queue.service';
import { DocumentRegisterService } from './document-register.service';
import { DocumentUploadService } from './document-upload.service';
import { DocumentRepository } from './document.repository';

/**
 * Outbox side only (no broker connection): the API role never needs RabbitMQ to accept an upload.
 * One shared dynamic-module instance for the whole app.
 */
export const DOCUMENT_MESSAGING = MessagingModule.forRoot({ service: 'document' });

/** The document domain: shared by the API role (controllers) and the worker role (event handlers). */
@Module({
    imports: [
        GrpcClientModule.register(R2_GRPC_REGISTRATION),
        DOCUMENT_MESSAGING,
    ],
    providers: [
        R2Client,
        R2DeleteTaskWriter,
        GenerateIdService,
        DocumentRepository,
        DocumentQueryService,
        DocumentQueueService,
        DocumentProcessingService,
        DocumentDeleteService,
        DocumentUploadService,
        DocumentRegisterService,
    ],
    exports: [
        R2Client,
        DocumentRepository,
        DocumentQueryService,
        DocumentQueueService,
        DocumentProcessingService,
        DocumentDeleteService,
        DocumentUploadService,
        DocumentRegisterService,
    ],
})
export class DocumentDomainModule {}
