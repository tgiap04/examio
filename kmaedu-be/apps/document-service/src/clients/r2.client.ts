import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES, r2V1 } from '@kmaedu/contracts';
import {
    GrpcClientRegistration,
    InvokeOptions,
    CallOptions,
    buildMetadata,
    invokeRpc,
    redactMetadata,
} from '@kmaedu/grpc';
import { ServiceMetadata } from '@kmaedu/auth-jwt';
import { canonicalR2PublicBase } from '@kmaedu/common';
import { Observable } from 'rxjs';

export const R2_GRPC = 'R2_GRPC';

/** r2-service registration (`R2_GRPC_URL`); file payloads travel as gRPC bytes. */
export const R2_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: R2_GRPC,
    pkg: PROTO_FILES.r2.pkg,
    protoFile: PROTO_FILES.r2.file,
    urlEnv: 'R2_GRPC_URL',
    maxMessageBytes: 500 * 1024 * 1024,
};

const RPC = `${PROTO_FILES.r2.pkg}.${r2V1.R2_SERVICE_NAME}`;
const DELETE_DEADLINE_MS = 30_000;
const UPLOAD_DEADLINE_MS = 60_000;

export interface R2DeletePartial {
    deletedCount: number;
    failedKeys: string[];
}

/**
 * Promise facade over r2 `UploadFile`, `CreatePresignedDownload` and `DeleteObjects`.
 * Every call runs as `svc:document` (r2 allowlists `document` in code).
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
        this.r2 = this.client.getService<r2V1.R2ServiceClient>(r2V1.R2_SERVICE_NAME);
    }

    private async call<T>(
        op: string,
        metadata: Metadata,
        invoke: (options: CallOptions, md: Metadata) => Observable<T>,
        options?: InvokeOptions
    ): Promise<T> {
        try {
            const md = await this.serviceMetadata.attach(metadata, 'r2');
            return await invokeRpc(`${RPC}/${op}`, (callOptions) => invoke(callOptions, md), options);
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
        folder: string
    ): Promise<string> {
        const response = await this.call(
            'UploadFile',
            buildMetadata(),
            (options, md) =>
                this.r2.uploadFile({ userId: '', filename, content: data, mimetype, folder }, md, options),
            { deadlineMs: UPLOAD_DEADLINE_MS }
        );
        const key = response.success ? response.keyR2 || response.fileId : '';
        if (!key) throw new Error(response.message || 'R2 returned no key');
        return key;
    }

    /** Presigned GET URL for a private object. */
    async createPresignedDownload(key: string, expiresInSeconds: number): Promise<string> {
        const response = await this.call('CreatePresignedDownload', buildMetadata(), (options, md) =>
            this.r2.createPresignedDownload({ key, expiresInSeconds }, md, options)
        );
        if (!response.url) throw new Error('R2 returned an empty download URL');
        return response.url;
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
        const base = canonicalR2PublicBase(process.env.R2_PUBLIC_URL || 'https://kmaedu-r2.fayedark.com');
        return `${base}/${key}`;
    }
}
