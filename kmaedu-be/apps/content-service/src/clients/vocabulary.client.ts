import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES, wordFamilyV1 } from '@kmaedu/contracts';
import {
    GrpcClientRegistration,
    buildMetadata,
    invokeRpc,
    redactMetadata,
} from '@kmaedu/grpc';
import { ServiceMetadata } from '@kmaedu/auth-jwt';

export const VOCABULARY_GRPC = 'VOCABULARY_GRPC';

/** vocabulary-service `WordFamilyService` (`VOCABULARY_GRPC_URL`). */
export const VOCABULARY_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: VOCABULARY_GRPC,
    pkg: PROTO_FILES.wordFamily.pkg,
    protoFile: PROTO_FILES.wordFamily.file,
    urlEnv: 'VOCABULARY_GRPC_URL',
};

const RPC = `${PROTO_FILES.wordFamily.pkg}.${wordFamilyV1.WORD_FAMILY_SERVICE_NAME}`;

/**
 * content -> vocabulary. Word families are shared catalog rows, so the call goes out
 * as `svc:content`. A missing id surfaces as a gRPC NOT_FOUND error (the caller maps it).
 */
@Injectable()
export class VocabularyClient implements OnModuleInit {
    private readonly logger = new Logger(VocabularyClient.name);
    private svc!: wordFamilyV1.WordFamilyServiceClient;

    constructor(
        @Inject(VOCABULARY_GRPC) private readonly client: ClientGrpc,
        private readonly serviceMetadata: ServiceMetadata
    ) {}

    onModuleInit(): void {
        this.svc = this.client.getService<wordFamilyV1.WordFamilyServiceClient>(
            wordFamilyV1.WORD_FAMILY_SERVICE_NAME
        );
    }

    async getWordFamily(
        id: string,
        metadata: Metadata = buildMetadata()
    ): Promise<wordFamilyV1.WordFamily> {
        try {
            const md = await this.serviceMetadata.attach(metadata, 'vocabulary');
            const res = await invokeRpc(`${RPC}/GetWordFamily`, (options) =>
                this.svc.getWordFamily({ id }, md, options)
            );
            if (!res.wordFamily) throw new Error('vocabulary returned an empty word family');
            return res.wordFamily;
        } catch (error) {
            this.logger.error(
                `Vocabulary GetWordFamily failed: ${(error as Error).message} ${JSON.stringify(redactMetadata(metadata))}`
            );
            throw error;
        }
    }
}
