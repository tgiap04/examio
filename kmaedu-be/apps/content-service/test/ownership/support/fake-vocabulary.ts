import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { status } from '@grpc/grpc-js';
import { PROTO_FILES } from '@kmaedu/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@kmaedu/grpc/testing';

export interface FakeWord {
    word: string;
    pos: string;
    meaningVi: string;
    example: string;
}

export interface FakeWordFamily {
    id: string;
    rootWord: string;
    categorySlug: string;
    categoryName: string;
    words: FakeWord[];
}

export interface FakeVocabulary {
    server: TestGrpcServer;
    /** Ids the fake was asked for, so specs can assert the call happened. */
    requested: string[];
    add(family: FakeWordFamily): void;
}

/**
 * Stands in for vocabulary-service: serves `WordFamilyService.GetWordFamily` over
 * real gRPC with the real wire contract (NOT_FOUND for an unknown id).
 */
export async function startFakeVocabulary(): Promise<FakeVocabulary> {
    const requested: string[] = [];
    const families = new Map<string, FakeWordFamily>();

    @Controller()
    class FakeVocabularyController {
        @GrpcMethod('WordFamilyService', 'GetWordFamily')
        getWordFamily(req: { id: string }) {
            requested.push(req.id);
            const family = families.get(req.id);
            if (!family) {
                throw new RpcException({
                    code: status.NOT_FOUND,
                    message: 'Word family not found',
                });
            }
            return {
                wordFamily: {
                    ...family,
                    words: family.words.map((w) => ({ meaningEn: '', ...w })),
                },
            };
        }
    }

    const moduleRef = await Test.createTestingModule({
        controllers: [FakeVocabularyController],
    }).compile();
    const server = await startTestGrpcServer(moduleRef, [PROTO_FILES.wordFamily]);
    return {
        server,
        requested,
        add: (family) => {
            families.set(family.id, family);
        },
    };
}
