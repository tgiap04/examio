import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES, r2V1 } from '@examio/contracts';
import {
    GrpcClientRegistration,
    InvokeOptions,
    invokeRpc,
    redactMetadata,
} from '@examio/grpc';
import { ServiceMetadata } from '@examio/auth-jwt';

export const R2_GRPC = 'R2_GRPC';

/** r2-service registration (`R2_GRPC_URL`); vocabulary only deletes (the FE uploads images via r2). */
export const R2_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: R2_GRPC,
    pkg: PROTO_FILES.r2.pkg,
    protoFile: PROTO_FILES.r2.file,
    urlEnv: 'R2_GRPC_URL',
};

const DELETE_DEADLINE_MS = 30_000;
const RPC = `${PROTO_FILES.r2.pkg}.${r2V1.R2_SERVICE_NAME}`;

export interface R2DeletePartial {
    deletedCount: number;
    failedKeys: string[];
}

/** Promise facade over r2 `DeleteObjects`, called as `svc:vocabulary`. */
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

    /** Idempotent batch delete reporting per-key failures; missing keys count as deleted. */
    async deleteObjectsPartial(
        keys: string[],
        metadata: Metadata,
        deadlineMs = DELETE_DEADLINE_MS
    ): Promise<R2DeletePartial> {
        try {
            const md = await this.serviceMetadata.attach(metadata, 'r2');
            const options: InvokeOptions = { deadlineMs };
            const response = await invokeRpc(
                `${RPC}/DeleteObjects`,
                (callOptions) => this.r2.deleteObjects({ keys }, md, callOptions),
                options
            );
            return {
                deletedCount: response.deletedCount,
                failedKeys: response.failedKeys ?? [],
            };
        } catch (error) {
            this.logger.error(
                `R2 DeleteObjects failed: ${(error as Error).message} ${JSON.stringify(redactMetadata(metadata))}`
            );
            throw error;
        }
    }
}
