import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { timeout } from 'rxjs';
import { PROTO_FILES, aiV1 } from '@kmaedu/contracts';
import { GrpcClientRegistration, buildMetadata, invokeRpc } from '@kmaedu/grpc';
import { ServiceMetadata } from '@kmaedu/auth-jwt';
import { QUERY_DEADLINE_MS, STREAM_IDLE_TIMEOUT_MS } from '../config/ai-chat.constants';
import { OpenedStream, openStream } from './ai-stream';

export const AI_GRPC = 'AI_GRPC';

/** ai-service registration (`AI_GRPC_URL`). */
export const AI_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: AI_GRPC,
    pkg: PROTO_FILES.ai.pkg,
    protoFile: PROTO_FILES.ai.file,
    urlEnv: 'AI_GRPC_URL',
};

const RPC = `${PROTO_FILES.ai.pkg}.${aiV1.AI_SERVICE_NAME}`;

/**
 * ai-chat -> ai-service under the `svc:ai-chat` service token (audience `ai`; ai-service allow-lists the
 * caller). The caller has already authorized every `userStorageId` it passes. Neither RPC is retried:
 * a model call is not repeated blindly.
 */
@Injectable()
export class AiClient implements OnModuleInit {
    private service!: aiV1.AiServiceClient;

    constructor(
        @Inject(AI_GRPC) private readonly client: ClientGrpc,
        private readonly serviceMetadata: ServiceMetadata
    ) {}

    onModuleInit(): void {
        this.service = this.client.getService<aiV1.AiServiceClient>(aiV1.AI_SERVICE_NAME);
    }

    /** `Query`: one answer, 60 s deadline. */
    async query(request: aiV1.QueryRequest): Promise<aiV1.QueryResponse> {
        const metadata = await this.serviceMetadata.attach(buildMetadata(), 'ai');
        return invokeRpc(`${RPC}/Query`, (options) => this.service.query(request, metadata, options), {
            deadlineMs: QUERY_DEADLINE_MS,
        });
    }

    /**
     * `StreamChat`: server-streaming with NO deadline (an answer may legitimately take minutes), so a
     * stream that stays silent for 60 s is cancelled instead. Resolves at the first frame; a failure
     * before it rejects (see `openStream`).
     */
    async streamChat(request: aiV1.StreamChatRequest): Promise<OpenedStream<aiV1.StreamChatResponse>> {
        const metadata = await this.serviceMetadata.attach(buildMetadata(), 'ai');
        return openStream(this.service.streamChat(request, metadata).pipe(timeout({ each: STREAM_IDLE_TIMEOUT_MS })));
    }
}
