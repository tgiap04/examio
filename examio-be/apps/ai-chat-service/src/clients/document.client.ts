import { Inject, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES, documentV1 } from '@examio/contracts';
import { GrpcClientRegistration, buildMetadata, invokeRpc } from '@examio/grpc';

export const DOCUMENT_GRPC = 'DOCUMENT_GRPC';

export const DOCUMENT_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: DOCUMENT_GRPC,
    pkg: PROTO_FILES.document.pkg,
    protoFile: PROTO_FILES.document.file,
    urlEnv: 'DOCUMENT_GRPC_URL',
};

const RPC = `${PROTO_FILES.document.pkg}.${documentV1.DOCUMENT_SERVICE_NAME}`;
const DELETE_DEADLINE_MS = 15_000;

/** The caller's access token, or 401: a request that reached a guarded route always carries one. */
export function requireUserToken(userToken: string | undefined): string {
    if (!userToken) throw new UnauthorizedException({ statusCode: 401, code: 'TOKEN_MISSING', message: 'Unauthorized' });
    return userToken;
}

/**
 * gRPC metadata acting as the caller. DocumentService answers only to a forwarded USER token (a
 * service token is PERMISSION_DENIED on every RPC), so there is deliberately no service fallback:
 * background code must not call document-service.
 */
export function userMetadata(userToken: string | undefined): Metadata {
    return buildMetadata({ authorization: `Bearer ${requireUserToken(userToken)}` });
}

/** Promise facade over `examio.document.v1.DocumentService`; `metadata` is required on every call. */
@Injectable()
export class DocumentClient implements OnModuleInit {
    private service!: documentV1.DocumentServiceClient;

    constructor(@Inject(DOCUMENT_GRPC) private readonly client: ClientGrpc) {}

    onModuleInit(): void {
        this.service = this.client.getService<documentV1.DocumentServiceClient>(documentV1.DOCUMENT_SERVICE_NAME);
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

    async ensureProcessed(id: string, metadata: Metadata): Promise<documentV1.DocumentInfo | undefined> {
        const res = await invokeRpc(`${RPC}/EnsureProcessed`, (o) => this.service.ensureProcessed({ id }, metadata, o));
        return res.document;
    }

    /** One call for all ids; ids the caller does not own (or that are gone) come back in `notFoundIds`. */
    deleteDocuments(ids: string[], metadata: Metadata): Promise<documentV1.DeleteDocumentsResponse> {
        return invokeRpc(`${RPC}/DeleteDocuments`, (o) => this.service.deleteDocuments({ ids }, metadata, o), {
            deadlineMs: DELETE_DEADLINE_MS,
        });
    }
}
