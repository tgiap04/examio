import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { PROTO_FILES, documentV1 } from '@examio/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@examio/grpc/testing';

const Status = documentV1.DocumentProcessingStatus;
export { Status as DocumentStatus };

export interface DocumentCall {
    rpc: string;
    ids?: string[];
    /** `sub` of the bearer token: a user id. A `svc:*` token is refused like the real service does. */
    caller: string;
    /** CreateUpload request fields, for assertions. */
    chargeCredits?: boolean;
    reuseDuplicate?: boolean;
}

export interface FakeDocument {
    server: TestGrpcServer;
    calls: DocumentCall[];
    docs: Map<string, documentV1.DocumentInfo>;
    /** Failures consumed in order by the next call of the given RPC (a gRPC status code + detail). */
    faults: Map<string, Array<{ code: number; details: string }>>;
    quotaFileCount: Map<string, number>;
    /** Seeds a document owned by `userId`. */
    add(userId: string, over?: Partial<documentV1.DocumentInfo>): documentV1.DocumentInfo;
    count(rpc: string): number;
    fault(rpc: string, code: number, details: string): void;
    close(): Promise<void>;
}

const STATE = Symbol('FAKE_DOCUMENT_STATE');
let counter = 0;

function subOf(metadata: Metadata): string {
    const bearer = String(metadata.get('authorization')[0] ?? '').replace(/^Bearer /, '');
    const payload = bearer.split('.')[1];
    return payload ? ((JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string }).sub ?? '') : '';
}

const fail = (code: number, details: string) => new RpcException({ code, message: details });

/**
 * A tiny document-service over real gRPC with the contract content relies on: user-token callers only
 * (a service token is PERMISSION_DENIED), owner-scoped reads (a foreign id is simply absent / NOT_FOUND),
 * `reuse_duplicate` on (user, filename, size), idempotent DeleteDocuments.
 */
export async function startFakeDocument(): Promise<FakeDocument> {
    const state = {
        calls: [] as DocumentCall[],
        docs: new Map<string, documentV1.DocumentInfo>(),
        faults: new Map<string, Array<{ code: number; details: string }>>(),
        quotaFileCount: new Map<string, number>(),
    };

    const make = (userId: string, over: Partial<documentV1.DocumentInfo> = {}): documentV1.DocumentInfo => {
        const id = over.id ?? `doc_${Date.now().toString(36)}_${++counter}`;
        const now = String(Date.now());
        const doc: documentV1.DocumentInfo = {
            id,
            userId,
            filename: `file-${id}.pdf`,
            mimetype: 'application/pdf',
            size: String(1024),
            keyR2: `ai-uploads/${userId}/${id}.pdf`,
            url: `https://r2.test/ai-uploads/${userId}/${id}.pdf`,
            processingStatus: Status.DOCUMENT_PROCESSING_STATUS_COMPLETED,
            creditCharged: false,
            pageCount: 0,
            createdAt: now,
            updatedAt: now,
            ...over,
        };
        state.docs.set(id, doc);
        return doc;
    };

    @Controller()
    class FakeDocumentController {
        constructor(@Inject(STATE) private readonly s: typeof state) {}

        /** Records the call, refuses service tokens, applies an injected fault; returns the caller. */
        private enter(rpc: string, md: Metadata, extra: Partial<DocumentCall> = {}): string {
            const caller = subOf(md);
            this.s.calls.push({ rpc, caller, ...extra });
            if (!caller || caller.startsWith('svc:')) throw fail(status.PERMISSION_DENIED, 'PERMISSION_DENIED');
            const fault = this.s.faults.get(rpc)?.shift();
            if (fault) throw fail(fault.code, fault.details);
            return caller;
        }

        private owned(userId: string, ids: string[]): documentV1.DocumentInfo[] {
            return [...new Set(ids)].flatMap((id) => {
                const doc = this.s.docs.get(id);
                return doc && doc.userId === userId ? [doc] : [];
            });
        }

        @GrpcMethod('DocumentService', 'CreateUpload')
        createUpload(req: documentV1.CreateUploadRequest, md: Metadata): documentV1.CreateUploadResponse {
            const userId = this.enter('CreateUpload', md, { chargeCredits: req.chargeCredits, reuseDuplicate: req.reuseDuplicate });
            const size = req.data.length;
            if (req.reuseDuplicate) {
                const existing = [...this.s.docs.values()]
                    .filter((d) => d.userId === userId && d.filename === req.filename && Number(d.size) === size)
                    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0];
                if (existing) return { document: existing, reused: true };
            }
            const doc = make(userId, {
                filename: req.filename,
                mimetype: req.mimetype,
                size: String(size),
                processingStatus: Status.DOCUMENT_PROCESSING_STATUS_PENDING,
            });
            return { document: doc, reused: false };
        }

        @GrpcMethod('DocumentService', 'GetDocumentsByIds')
        getDocumentsByIds(req: documentV1.GetDocumentsByIdsRequest, md: Metadata): documentV1.GetDocumentsByIdsResponse {
            const userId = this.enter('GetDocumentsByIds', md, { ids: req.ids });
            return { documents: this.owned(userId, req.ids) };
        }

        @GrpcMethod('DocumentService', 'AssertOwnership')
        assertOwnership(req: documentV1.AssertOwnershipRequest, md: Metadata): documentV1.AssertOwnershipResponse {
            const userId = this.enter('AssertOwnership', md, { ids: req.ids });
            if (this.owned(userId, req.ids).length !== new Set(req.ids).size) throw fail(status.NOT_FOUND, 'NOT_FOUND');
            return {};
        }

        @GrpcMethod('DocumentService', 'GetQuota')
        getQuota(_req: documentV1.GetQuotaRequest, md: Metadata): documentV1.GetQuotaResponse {
            const userId = this.enter('GetQuota', md);
            const fileCount = this.s.quotaFileCount.get(userId) ?? [...this.s.docs.values()].filter((d) => d.userId === userId).length;
            return { usedThisMonth: fileCount, monthlyLimit: -1, fileCount };
        }

        @GrpcMethod('DocumentService', 'EnsureProcessed')
        ensureProcessed(req: documentV1.EnsureProcessedRequest, md: Metadata): documentV1.EnsureProcessedResponse {
            const userId = this.enter('EnsureProcessed', md, { ids: [req.id] });
            const [doc] = this.owned(userId, [req.id]);
            if (!doc) throw fail(status.NOT_FOUND, 'NOT_FOUND');
            if (doc.processingStatus === Status.DOCUMENT_PROCESSING_STATUS_FAILED) {
                doc.processingStatus = Status.DOCUMENT_PROCESSING_STATUS_PENDING;
            }
            return { document: doc };
        }

        @GrpcMethod('DocumentService', 'DeleteDocuments')
        deleteDocuments(req: documentV1.DeleteDocumentsRequest, md: Metadata): documentV1.DeleteDocumentsResponse {
            const userId = this.enter('DeleteDocuments', md, { ids: req.ids });
            const owned = this.owned(userId, req.ids);
            for (const doc of owned) this.s.docs.delete(doc.id);
            const goneIds = new Set(owned.map((d) => d.id));
            return {
                deleted: owned.map((d) => ({ id: d.id, filename: d.filename })),
                notFoundIds: [...new Set(req.ids)].filter((id) => !goneIds.has(id)),
            };
        }

        @GrpcMethod('DocumentService', 'GetDownloadUrl')
        getDownloadUrl(req: documentV1.GetDownloadUrlRequest, md: Metadata): documentV1.GetDownloadUrlResponse {
            const userId = this.enter('GetDownloadUrl', md, { ids: [req.id] });
            const [doc] = this.owned(userId, [req.id]);
            if (!doc) throw fail(status.NOT_FOUND, 'NOT_FOUND');
            return { downloadUrl: `https://r2.test/signed/${doc.keyR2}?ttl=3600`, expiresAt: String(Date.now() + 3_600_000) };
        }

        @GrpcMethod('DocumentService', 'ListDocuments')
        listDocuments(req: documentV1.ListDocumentsRequest, md: Metadata): documentV1.ListDocumentsResponse {
            const userId = this.enter('ListDocuments', md);
            const page = req.page || 1;
            const size = req.size || 10;
            const mine = [...this.s.docs.values()]
                .filter((d) => d.userId === userId)
                .sort((a, b) => Number(b.createdAt) - Number(a.createdAt) || b.id.localeCompare(a.id));
            return { documents: mine.slice((page - 1) * size, page * size) };
        }
    }

    const moduleRef = await Test.createTestingModule({
        controllers: [FakeDocumentController],
        providers: [{ provide: STATE, useValue: state }],
    }).compile();
    const server = await startTestGrpcServer(moduleRef, [PROTO_FILES.document]);
    return {
        ...state,
        server,
        add: (userId, over) => make(userId, over),
        count: (rpc) => state.calls.filter((c) => c.rpc === rpc).length,
        fault: (rpc, code, details) => {
            const list = state.faults.get(rpc) ?? [];
            list.push({ code, details });
            state.faults.set(rpc, list);
        },
        close: () => server.close(),
    };
}
