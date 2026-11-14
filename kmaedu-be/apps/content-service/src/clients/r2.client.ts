import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES, r2V1 } from '@kmaedu/contracts';
import {
    GrpcClientRegistration,
    InvokeOptions,
    CallOptions,
    invokeRpc,
    redactMetadata,
} from '@kmaedu/grpc';
import { ServiceMetadata } from '@kmaedu/auth-jwt';
import { canonicalR2PublicBase } from '@kmaedu/common';
import { Observable } from 'rxjs';

export const R2_GRPC = 'R2_GRPC';

/** One registration shared by every content module that talks to r2-service. */
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

/**
 * Promise facade over the generated R2Service client. `metadata` is required on
 * every call so a forgotten argument fails to compile.
 */
@Injectable()
export class R2Client implements OnModuleInit {
    private readonly logger = new Logger(R2Client.name);
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

    /**
     * Runs one RPC as `svc:content` (a forwarded user token in `metadata` wins);
     * failures are logged with redacted metadata, then rethrown.
     */
    private async call<T>(
        op: string,
        metadata: Metadata,
        invoke: (options: CallOptions, md: Metadata) => Observable<T>,
        options?: InvokeOptions
    ): Promise<T> {
        try {
            const md = await this.serviceMetadata.attach(metadata, 'r2');
            return await invokeRpc(
                `${RPC}/${op}`,
                (callOptions) => invoke(callOptions, md),
                options
            );
        } catch (error) {
            this.logger.error(
                `R2 ${op} failed: ${(error as Error).message} ${JSON.stringify(redactMetadata(metadata))}`
            );
            throw error;
        }
    }

    /** Uploads a file and returns its R2 key. */
    async uploadFile(
        filename: string,
        data: Buffer,
        mimetype: string,
        folder: string | undefined,
        metadata: Metadata
    ): Promise<string> {
        const response = await this.call(
            'UploadFile',
            metadata,
            (options, md) =>
                this.r2.uploadFile(
                    {
                        userId: '',
                        filename,
                        content: data,
                        mimetype,
                        folder: folder ?? '',
                    },
                    md,
                    options
                ),
            { deadlineMs: 60_000 }
        );
        if (!response.success) {
            throw new Error(response.message || 'Upload failed');
        }
        const key = response.keyR2 || response.fileId;
        if (!key) {
            this.logger.error('R2 upload succeeded without returning a key');
            throw new Error('R2 service returned empty key');
        }
        return key;
    }

    /** Idempotent batch delete reporting per-key failures; missing keys count as deleted. */
    async deleteObjectsPartial(
        keys: string[],
        metadata: Metadata,
        deadlineMs = DELETE_DEADLINE_MS
    ): Promise<R2DeletePartial> {
        const response = await this.call(
            'DeleteObjects',
            metadata,
            (options, md) => this.r2.deleteObjects({ keys }, md, options),
            { deadlineMs }
        );
        return { deletedCount: response.deletedCount, failedKeys: response.failedKeys ?? [] };
    }

    getPublicUrl(key: string): string {
        const base = canonicalR2PublicBase(process.env.R2_PUBLIC_URL || 'https://examio-r2.fayedark.com');
        return `${base}/${key}`;
    }
}
