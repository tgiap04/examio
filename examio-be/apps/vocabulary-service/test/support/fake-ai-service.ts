import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { PROTO_FILES, aiV1 } from '@examio/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@examio/grpc/testing';

export interface FakeAiRequest {
    /** Raw `authorization` metadata entry, undefined when the caller sent none. */
    authorization: string | undefined;
    body: aiV1.GenerateWordFamilyRequest;
}

export interface FakeAiService {
    /** `127.0.0.1:<port>`: what `AI_GRPC_URL` points at. */
    url: string;
    requests: FakeAiRequest[];
    /** Reject calls without `authorization: Bearer <token>` as ai-service does. Default true. */
    enforceToken: { value: boolean };
    /** When set, the next GenerateWordFamily fails with it (cleared after one use). */
    failNext: { value: { code: number; message: string; errorCode?: string } | null };
    close(): Promise<void>;
}

const STATE = Symbol('FAKE_AI_STATE');

interface State {
    requests: FakeAiRequest[];
    enforceToken: { value: boolean };
    failNext: FakeAiService['failNext'];
}

/**
 * A grpc-js `examio.ai.v1.AiService` server (only GenerateWordFamily), so the
 * production `AiClient` is what the specs exercise over a real channel.
 */
export async function startFakeAiService(): Promise<FakeAiService> {
    const state: State = {
        requests: [],
        enforceToken: { value: true },
        failNext: { value: null },
    };

    @Controller()
    class FakeAiController {
        constructor(@Inject(STATE) private readonly s: State) {}

        @GrpcMethod('AiService', 'GenerateWordFamily')
        generateWordFamily(
            req: aiV1.GenerateWordFamilyRequest,
            md: Metadata
        ): aiV1.GenerateWordFamilyResponse {
            const authorization = md.get('authorization')[0] as string | undefined;
            this.s.requests.push({ authorization, body: req });
            if (this.s.enforceToken.value && !/^Bearer .+/.test(authorization ?? '')) {
                throw new RpcException({ code: status.UNAUTHENTICATED, message: 'UNAUTHENTICATED' });
            }
            const fail = this.s.failNext.value;
            if (fail) {
                this.s.failNext.value = null;
                const trailers = new Metadata();
                if (fail.errorCode) trailers.set('x-error-code', fail.errorCode);
                throw Object.assign(new RpcException({ code: fail.code, message: fail.message }), {
                    getError: () => ({ code: fail.code, message: fail.message, metadata: trailers }),
                });
            }
            return {
                data: {
                    rootWord: req.rootWord ?? 'order',
                    categorySlug: req.categorySlug,
                    words: [
                        {
                            word: 'order',
                            pos: 'verb',
                            meaningEn: 'to request',
                            meaningVi: 'đặt hàng',
                            example: 'I order tea.',
                            affix: { prefix: '', root: 'order', suffix: '' },
                        },
                    ],
                },
            };
        }
    }

    const moduleRef = await Test.createTestingModule({
        controllers: [FakeAiController],
        providers: [{ provide: STATE, useValue: state }],
    }).compile();
    const server: TestGrpcServer = await startTestGrpcServer(moduleRef, [PROTO_FILES.ai]);
    return {
        url: server.url,
        requests: state.requests,
        enforceToken: state.enforceToken,
        failNext: state.failNext,
        close: () => server.close(),
    };
}
