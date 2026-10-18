import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES, r2V1 } from '@examio/contracts';
import { GrpcClientRegistration, invokeRpc } from '@examio/grpc';

export const R2_GRPC = 'R2_GRPC';

export const R2_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: R2_GRPC,
    pkg: PROTO_FILES.r2.pkg,
    protoFile: PROTO_FILES.r2.file,
    urlEnv: 'R2_GRPC_URL',
    maxMessageBytes: 500 * 1024 * 1024,
};

const RPC = `${PROTO_FILES.r2.pkg}.${r2V1.R2_SERVICE_NAME}`;

/** Typed gateway to r2-service for profile images. Every call takes explicit metadata. */
@Injectable()
export class R2Client implements OnModuleInit {
    private r2!: r2V1.R2ServiceClient;

    constructor(@Inject(R2_GRPC) private readonly client: ClientGrpc) {}

    onModuleInit(): void {
        this.r2 = this.client.getService<r2V1.R2ServiceClient>(
            r2V1.R2_SERVICE_NAME
        );
    }

    uploadFile(
        request: r2V1.UploadFileRequest,
        metadata: Metadata
    ): Promise<r2V1.UploadFileResponse> {
        return invokeRpc(
            `${RPC}/UploadFile`,
            (options) => this.r2.uploadFile(request, metadata, options),
            { deadlineMs: 60_000 }
        );
    }

    deleteFile(
        keyR2: string,
        metadata: Metadata
    ): Promise<r2V1.DeleteFileResponse> {
        return invokeRpc(`${RPC}/DeleteFile`, (options) =>
            this.r2.deleteFile({ keyR2 }, metadata, options)
        );
    }
}
