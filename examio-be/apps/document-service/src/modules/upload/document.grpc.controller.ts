import { Controller } from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { documentV1 } from '@examio/contracts';
import {
    RequirePermissions,
    RequirePermissionsOrService,
    extractRpcToken,
    principalOfMetadata,
} from '@examio/auth-jwt';
import { DEFAULT_LIST_SIZE, MAX_LIST_SIZE, MAX_UPLOAD_BYTES } from '../../config/document.constants';
import { DocumentDeleteService } from './document-delete.service';
import { DocumentErrorCode, documentError, toRpcException } from './document-errors';
import { toDocumentInfo } from './document-mapper';
import { DocumentProcessingService } from './document-processing.service';
import { DocumentQueryService } from './document-query.service';
import { DocumentUploadService } from './document-upload.service';

/** The acting user of an RPC: the `sub` of the forwarded user token. Service tokens never act here. */
function actorOf(metadata: Metadata): string {
    const principal = principalOfMetadata(metadata);
    if (principal?.kind !== 'user') {
        throw new RpcException({ code: status.PERMISSION_DENIED, message: 'PERMISSION_DENIED' });
    }
    return principal.id;
}

/** Runs an RPC body; any failure is answered as its gRPC equivalent (`toRpcException`). */
async function withRpcErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
        return await work();
    } catch (error) {
        throw toRpcException(error);
    }
}

/**
 * `examio.document.v1.DocumentService`: the same service layer as the HTTP routes, user-scoped by the
 * forwarded token. A row that is not the caller's is NOT_FOUND / `not_found_ids`, never PERMISSION_DENIED.
 */
@Controller()
@documentV1.DocumentServiceControllerMethods()
export class DocumentGrpcController implements documentV1.DocumentServiceController {
    constructor(
        private readonly uploads: DocumentUploadService,
        private readonly queries: DocumentQueryService,
        private readonly processing: DocumentProcessingService,
        private readonly deletes: DocumentDeleteService
    ) {}

    @RequirePermissions('document:upload')
    async createUpload(request: documentV1.CreateUploadRequest, metadata: Metadata): Promise<documentV1.CreateUploadResponse> {
        const userId = actorOf(metadata);
        return withRpcErrors(async () => {
            if (!request.filename.trim() || !request.mimetype.trim()) {
                throw documentError(400, DocumentErrorCode.VALIDATION_FAILED, 'filename and mimetype are required');
            }
            if (request.data.length === 0 || request.data.length > MAX_UPLOAD_BYTES) {
                throw documentError(400, DocumentErrorCode.VALIDATION_FAILED, 'data must be 1 byte to 50 MB');
            }
            const outcome = await this.uploads.createFromBytes(
                userId,
                { filename: request.filename, mimetype: request.mimetype, data: Buffer.from(request.data) },
                { chargeCredits: request.chargeCredits, reuseDuplicate: request.reuseDuplicate },
                extractRpcToken(metadata)
            );
            return { document: toDocumentInfo(outcome.document), reused: outcome.reused };
        });
    }

    @RequirePermissions('document:upload')
    async getDocumentsByIds(
        request: documentV1.GetDocumentsByIdsRequest,
        metadata: Metadata
    ): Promise<documentV1.GetDocumentsByIdsResponse> {
        const userId = actorOf(metadata);
        return withRpcErrors(async () => ({
            documents: (await this.queries.getByIds(userId, request.ids)).map(toDocumentInfo),
        }));
    }

    @RequirePermissions('document:upload')
    async assertOwnership(
        request: documentV1.AssertOwnershipRequest,
        metadata: Metadata
    ): Promise<documentV1.AssertOwnershipResponse> {
        const userId = actorOf(metadata);
        return withRpcErrors(async () => {
            await this.queries.assertOwnership(userId, request.ids);
            return {};
        });
    }

    // Any verified user (the dashboard stat is also shown to students); the body names no user, the
    // token `sub` is the only subject. No service caller: there is no user to count for.
    @RequirePermissionsOrService([], { callers: [] })
    async getQuota(_request: documentV1.GetQuotaRequest, metadata: Metadata): Promise<documentV1.GetQuotaResponse> {
        const userId = actorOf(metadata);
        return withRpcErrors(() => this.queries.getQuota(userId));
    }

    @RequirePermissions('document:upload')
    async ensureProcessed(
        request: documentV1.EnsureProcessedRequest,
        metadata: Metadata
    ): Promise<documentV1.EnsureProcessedResponse> {
        const userId = actorOf(metadata);
        return withRpcErrors(async () => ({
            document: toDocumentInfo(await this.processing.ensureProcessed(userId, request.id)),
        }));
    }

    // A service-caller allowlist stays empty until a service actually deletes on a user's behalf
    // (user deletion is deferred); declared this way so adding one is a one-line change.
    @RequirePermissionsOrService(['document:upload'], { callers: [] })
    async deleteDocuments(
        request: documentV1.DeleteDocumentsRequest,
        metadata: Metadata
    ): Promise<documentV1.DeleteDocumentsResponse> {
        const userId = actorOf(metadata);
        return withRpcErrors(async () => {
            const result = await this.deletes.deleteOwned(userId, request.ids);
            return { deleted: result.deleted, notFoundIds: result.notFoundIds };
        });
    }

    // Owner-scoped page of the caller's documents, newest first (exam's `recent-uploads` adds its
    // generated-history summaries). `page` 1-based; `size` 1..100.
    @RequirePermissions('document:upload')
    async listDocuments(
        request: documentV1.ListDocumentsRequest,
        metadata: Metadata
    ): Promise<documentV1.ListDocumentsResponse> {
        const userId = actorOf(metadata);
        return withRpcErrors(async () => {
            if (request.page < 0 || request.size < 0 || request.size > MAX_LIST_SIZE) {
                throw documentError(400, DocumentErrorCode.VALIDATION_FAILED, `size must be at most ${MAX_LIST_SIZE}`);
            }
            const rows = await this.queries.listRecent(userId, request.page || 1, request.size || DEFAULT_LIST_SIZE);
            return { documents: rows.map(toDocumentInfo) };
        });
    }

    // Owner-scoped, read-only: a 1 h presigned GET so a generation can process a document that has no
    // chunks yet. Another user's id is NOT_FOUND.
    @RequirePermissions('document:upload')
    async getDownloadUrl(
        request: documentV1.GetDownloadUrlRequest,
        metadata: Metadata
    ): Promise<documentV1.GetDownloadUrlResponse> {
        const userId = actorOf(metadata);
        return withRpcErrors(async () => {
            if (!request.id.trim()) throw documentError(400, DocumentErrorCode.VALIDATION_FAILED, 'id is required');
            const { downloadUrl, expiresAt } = await this.processing.downloadUrlOf(userId, request.id);
            return { downloadUrl, expiresAt: String(expiresAt) };
        });
    }
}
