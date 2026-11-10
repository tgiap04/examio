import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES, r2V1 } from '@examio/contracts';
import { GrpcClientRegistration, invokeRpc } from '@examio/grpc';
import { ServiceMetadata } from '@examio/auth-jwt';

export const R2_GRPC = 'R2_GRPC';

export const R2_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: R2_GRPC,
    pkg: PROTO_FILES.r2.pkg,
    protoFile: PROTO_FILES.r2.file,
    urlEnv: 'R2_GRPC_URL',
    maxMessageBytes: 500 * 1024 * 1024,
};

const DELETE_DEADLINE_MS = 30_000;

export interface R2DeletePartial {
    deletedCount: number;
    failedKeys: string[];
}

const RPC = `${PROTO_FILES.r2.pkg}.${r2V1.R2_SERVICE_NAME}`;

/** Typed gateway to r2-service for profile images. Every call takes explicit metadata. */
@Injectable()
export class R2Client implements OnModuleInit {
    private r2!: r2V1.R2ServiceClient;

    constructor(
        @Inject(R2_GRPC) private readonly client: ClientGrpc,
        private readonly serviceMetadata: ServiceMetadata
    ) {}

    onModuleInit(): void {
        this.r2 = this.client.getService<r2V1.R2ServiceClient>(
            r2V1.R2_SERVICE_NAME
        );
    }

    /** Runs as `svc:auth` (locally signed service token). */
    async uploadFile(
        request: r2V1.UploadFileRequest,
        metadata: Metadata
    ): Promise<r2V1.UploadFileResponse> {
        const md = await this.serviceMetadata.attach(metadata, 'r2');
        return invokeRpc(
            `${RPC}/UploadFile`,
            (options) => this.r2.uploadFile(request, md, options),
            { deadlineMs: 60_000 }
        );
    }

    /** Idempotent batch delete reporting per-key failures; missing keys count as deleted. */
    async deleteObjectsPartial(
        keys: string[],
        metadata: Metadata,
        deadlineMs = DELETE_DEADLINE_MS
    ): Promise<R2DeletePartial> {
        const md = await this.serviceMetadata.attach(metadata, 'r2');
        const response = await invokeRpc(
            `${RPC}/DeleteObjects`,
            (options) => this.r2.deleteObjects({ keys }, md, options),
            { deadlineMs }
        );
        return { deletedCount: response.deletedCount, failedKeys: response.failedKeys ?? [] };
    }
}
