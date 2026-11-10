import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import { PROTO_FILES, aiV1 } from '@kmaedu/contracts';
import { GrpcClientRegistration, buildMetadata, invokeRpc } from '@kmaedu/grpc';
import { ServiceMetadata } from '@kmaedu/auth-jwt';
import type {
    AiWordFamilyRequest,
    AiWordFamilyResponse,
} from '../modules/word-family/interfaces/word-family.interface';

export const AI_GRPC = 'AI_GRPC';

/** ai-service registration (`AI_GRPC_URL`). */
export const AI_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: AI_GRPC,
    pkg: PROTO_FILES.ai.pkg,
    protoFile: PROTO_FILES.ai.file,
    urlEnv: 'AI_GRPC_URL',
};

const RPC = `${PROTO_FILES.ai.pkg}.${aiV1.AI_SERVICE_NAME}`;

/** Generation runs a model call; ai-service documents 60 s as the ceiling. Never retried. */
export const GENERATE_DEADLINE_MS = 60_000;

const ERROR_CODE_TRAILER = 'x-error-code';

const INTERNAL_MESSAGE = 'Sinh word family thất bại.';

/** What the model-error codes of ai.proto mean to the caller (the code itself is kept for support). */
function modelErrorMessage(code: string): string {
    return `Mô hình AI hiện không khả dụng (${code}). Vui lòng thử lại sau.`;
}

/** The proto's word family in the shape the word-family flow stores (a missing affix part is ''). */
function toWordFamily(
    data: aiV1.WordFamilyData
): NonNullable<AiWordFamilyResponse['data']> {
    return {
        rootWord: data.rootWord,
        categorySlug: data.categorySlug,
        words: data.words.map((w) => ({
            word: w.word,
            pos: w.pos,
            meaningEn: w.meaningEn,
            meaningVi: w.meaningVi,
            example: w.example,
            affix: {
                prefix: w.affix?.prefix ?? '',
                root: w.affix?.root ?? '',
                suffix: w.affix?.suffix ?? '',
            },
        })),
    };
}

/**
 * vocabulary -> ai-service `AiService.GenerateWordFamily` under service identity
 * (`svc:vocabulary`, audience `ai`). A failed generation keeps the `{ success, error }`
 * shape the word-family flow already handles; statuses that say nothing about the
 * generation itself (UNAUTHENTICATED, PERMISSION_DENIED, DEADLINE_EXCEEDED,
 * UNAVAILABLE without a model code) are rethrown.
 */
@Injectable()
export class AiClient implements OnModuleInit {
    private readonly logger = new Logger(AiClient.name);
    private service!: aiV1.AiServiceClient;

    constructor(
        @Inject(AI_GRPC) private readonly client: ClientGrpc,
        private readonly serviceMetadata: ServiceMetadata
    ) {}

    onModuleInit(): void {
        this.service = this.client.getService<aiV1.AiServiceClient>(
            aiV1.AI_SERVICE_NAME
        );
    }

    async generateWordFamily(
        payload: AiWordFamilyRequest
    ): Promise<AiWordFamilyResponse> {
        const metadata = await this.serviceMetadata.attach(buildMetadata(), 'ai');
        const request: aiV1.GenerateWordFamilyRequest = {
            categorySlug: payload.categorySlug,
            categoryName: payload.categoryName,
            numRootWords: payload.numRootWords,
            excludeRootWords: payload.excludeRootWords,
            rootWord: payload.rootWord,
            modelType: payload.modelType,
        };
        try {
            const response = await invokeRpc(
                `${RPC}/GenerateWordFamily`,
                (o) => this.service.generateWordFamily(request, metadata, o),
                { deadlineMs: GENERATE_DEADLINE_MS }
            );
            if (!response.data) {
                return { success: false, error: INTERNAL_MESSAGE };
            }
            return { success: true, data: toWordFamily(response.data) };
        } catch (error) {
            return this.toFailure(error);
        }
    }

    private toFailure(error: unknown): AiWordFamilyResponse {
        const err = error as { code?: number; message?: string; metadata?: Metadata };
        const modelCode = String(err.metadata?.get(ERROR_CODE_TRAILER)?.[0] ?? '');
        if (err.code === status.UNAVAILABLE && modelCode) {
            this.logger.warn(`ai-service model error ${modelCode}`);
            return { success: false, error: modelErrorMessage(modelCode) };
        }
        if (err.code === status.INVALID_ARGUMENT) {
            return { success: false, error: err.message || INTERNAL_MESSAGE };
        }
        if (err.code === status.INTERNAL) {
            // The message carries a correlation reference only, never raw model text.
            this.logger.error(`ai-service INTERNAL: ${err.message}`);
            return { success: false, error: INTERNAL_MESSAGE };
        }
        throw error;
    }
}
