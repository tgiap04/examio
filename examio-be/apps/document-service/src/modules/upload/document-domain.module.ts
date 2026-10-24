import { Module } from '@nestjs/common';
import { ServiceMetadata } from '@examio/auth-jwt';
import { GenerateIdService } from '@examio/common';
import {
    FINANCE_GRPC_REGISTRATION,
    FinanceClient,
    GRPC_METADATA_ATTACHER,
    GrpcClientModule,
} from '@examio/grpc';
import { MessagingModule, R2DeleteTaskWriter } from '@examio/messaging';
import { DocumentFinance } from '../../clients/document-finance.service';
import { R2_GRPC_REGISTRATION, R2Client } from '../../clients/r2.client';
import { DocumentChargeService } from './document-charge.service';
import { DocumentDeleteService } from './document-delete.service';
import { DocumentProcessingService } from './document-processing.service';
import { DocumentQueryService } from './document-query.service';
import { DocumentRegisterService } from './document-register.service';
import { DocumentUploadService } from './document-upload.service';
import { DocumentRepository } from './document.repository';

/**
 * Outbox side only (no broker connection): the API role never needs RabbitMQ to accept an upload.
 * One shared dynamic-module instance for the whole app.
 */
export const DOCUMENT_MESSAGING = MessagingModule.forRoot({ service: 'document' });

/** The document domain: shared by the API role (controllers) and the worker role (reaper, event handlers). */
@Module({
    imports: [
        GrpcClientModule.register(R2_GRPC_REGISTRATION, FINANCE_GRPC_REGISTRATION),
        DOCUMENT_MESSAGING,
    ],
    providers: [
        { provide: GRPC_METADATA_ATTACHER, useExisting: ServiceMetadata },
        FinanceClient,
        DocumentFinance,
        R2Client,
        R2DeleteTaskWriter,
        GenerateIdService,
        DocumentRepository,
        DocumentQueryService,
        DocumentChargeService,
        DocumentProcessingService,
        DocumentDeleteService,
        DocumentUploadService,
        DocumentRegisterService,
    ],
    exports: [
        R2Client,
        DocumentRepository,
        DocumentQueryService,
        DocumentChargeService,
        DocumentProcessingService,
        DocumentDeleteService,
        DocumentUploadService,
        DocumentRegisterService,
    ],
})
export class DocumentDomainModule {}
