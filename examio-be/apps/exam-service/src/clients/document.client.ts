import { Inject, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES, documentV1 } from '@examio/contracts';
import {
    GrpcClientRegistration,
    LARGE_MESSAGE_BYTES,
    buildMetadata,
    invokeRpc,
} from '@examio/grpc';

export const DOCUMENT_GRPC = 'DOCUMENT_GRPC';

/** `CreateUpload` carries the file bytes (up to 50 MB), hence the large message limit. */
export const DOCUMENT_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: DOCUMENT_GRPC,
    pkg: PROTO_FILES.document.pkg,
    protoFile: PROTO_FILES.document.file,
    urlEnv: 'DOCUMENT_GRPC_URL',
    maxMessageBytes: LARGE_MESSAGE_BYTES,
};

const RPC = `${PROTO_FILES.document.pkg}.${documentV1.DOCUMENT_SERVICE_NAME}`;

/** The file goes over the wire and into R2 inside this call; it is never retried (not in IDEMPOTENT_RPCS). */
const CREATE_UPLOAD_DEADLINE_MS = 90_000;

/**
 * gRPC metadata acting as the caller. DocumentService answers only to a forwarded USER token (a service
 * token, `svc:exam` included, is PERMISSION_DENIED on every RPC), so there is deliberately no service
 * fallback here: background code must not call document-service.
 */
export function userMetadata(userToken: string | undefined): Metadata {
    return buildMetadata({ authorization: `Bearer ${requireUserToken(userToken)}` });
}

/** The caller's access token, or 401: a request that reached a guarded route always carries one. */
export function requireUserToken(userToken: string | undefined): string {
    if (!userToken) throw new UnauthorizedException({ statusCode: 401, code: 'TOKEN_MISSING', message: 'Unauthorized' });
    return userToken;
}

/**
 * Promise facade over `examio.document.v1.DocumentService`. `metadata` is required on every call
 * (build it with `userMetadata`) so a forgotten token fails to compile.
 */
@Injectable()
export class DocumentClient implements OnModuleInit {
    private service!: documentV1.DocumentServiceClient;

    constructor(@Inject(DOCUMENT_GRPC) private readonly client: ClientGrpc) {}

    onModuleInit(): void {
        this.service = this.client.getService<documentV1.DocumentServiceClient>(documentV1.DOCUMENT_SERVICE_NAME);
    }

    createUpload(request: documentV1.CreateUploadRequest, metadata: Metadata): Promise<documentV1.CreateUploadResponse> {
        return invokeRpc(`${RPC}/CreateUpload`, (o) => this.service.createUpload(request, metadata, o), {
            deadlineMs: CREATE_UPLOAD_DEADLINE_MS,
        });
    }

    /** Caller-owned rows only; an id that is missing or foreign is absent from the result. */
    async getDocumentsByIds(ids: string[], metadata: Metadata): Promise<documentV1.DocumentInfo[]> {
        const res = await invokeRpc(`${RPC}/GetDocumentsByIds`, (o) => this.service.getDocumentsByIds({ ids }, metadata, o));
        return res.documents;
    }

    /** Resolves when the caller owns every id; NOT_FOUND otherwise. */
    async assertOwnership(ids: string[], metadata: Metadata): Promise<void> {
        await invokeRpc(`${RPC}/AssertOwnership`, (o) => this.service.assertOwnership({ ids }, metadata, o));
    }

    getQuota(metadata: Metadata): Promise<documentV1.GetQuotaResponse> {
        return invokeRpc(`${RPC}/GetQuota`, (o) => this.service.getQuota({}, metadata, o));
    }

    async ensureProcessed(id: string, metadata: Metadata): Promise<documentV1.DocumentInfo | undefined> {
        const res = await invokeRpc(`${RPC}/EnsureProcessed`, (o) => this.service.ensureProcessed({ id }, metadata, o));
        return res.document;
    }

    deleteDocuments(ids: string[], metadata: Metadata): Promise<documentV1.DeleteDocumentsResponse> {
        return invokeRpc(`${RPC}/DeleteDocuments`, (o) => this.service.deleteDocuments({ ids }, metadata, o), {
            deadlineMs: 15_000,
        });
    }

    /** A 1 h presigned GET for an owned document (NOT_FOUND when it is not the caller's). */
    getDownloadUrl(id: string, metadata: Metadata): Promise<documentV1.GetDownloadUrlResponse> {
        return invokeRpc(`${RPC}/GetDownloadUrl`, (o) => this.service.getDownloadUrl({ id }, metadata, o));
    }

    async listDocuments(page: number, size: number, metadata: Metadata): Promise<documentV1.DocumentInfo[]> {
        const res = await invokeRpc(`${RPC}/ListDocuments`, (o) => this.service.listDocuments({ page, size }, metadata, o));
        return res.documents;
    }
}
