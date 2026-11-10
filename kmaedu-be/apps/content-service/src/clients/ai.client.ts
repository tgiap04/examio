import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { PROTO_FILES, aiV1 } from '@kmaedu/contracts';
import { GrpcClientRegistration, buildMetadata, invokeRpc } from '@kmaedu/grpc';
import { ServiceMetadata } from '@kmaedu/auth-jwt';

export const AI_GRPC = 'AI_GRPC';

export const AI_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: AI_GRPC,
    pkg: PROTO_FILES.ai.pkg,
    protoFile: PROTO_FILES.ai.file,
    urlEnv: 'AI_GRPC_URL',
};

const RPC = `${PROTO_FILES.ai.pkg}.${aiV1.AI_SERVICE_NAME}`;

/** The catalog probes every model's live availability, which the HTTP call also gave 60 s for. */
const LIST_MODELS_DEADLINE_MS = 60_000;

/**
 * content -> ai-service, synchronous AI. Callers are services: every call carries a `svc:content` token for
 * audience `ai` (ai-service allow-lists the caller). Generation itself is asynchronous (events).
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

    async listModels(): Promise<aiV1.ListModelsResponse> {
        const metadata = await this.serviceMetadata.attach(buildMetadata(), 'ai');
        return invokeRpc(`${RPC}/ListModels`, (o) => this.service.listModels({}, metadata, o), {
            deadlineMs: LIST_MODELS_DEADLINE_MS,
        });
    }
}
