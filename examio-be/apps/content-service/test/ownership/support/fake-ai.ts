import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { PROTO_FILES, aiV1 } from '@examio/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@examio/grpc/testing';

export interface FakeAi {
    server: TestGrpcServer;
    /** `sub` of every ListModels caller (must be `svc:content`). */
    callers: string[];
    /** Answer the next ListModels with UNAVAILABLE (ai-service down). */
    down: { value: boolean };
    close(): Promise<void>;
}

const STATE = Symbol('FAKE_AI_STATE');

function subOf(metadata: Metadata): string {
    const bearer = String(metadata.get('authorization')[0] ?? '').replace(/^Bearer /, '');
    const payload = bearer.split('.')[1];
    return payload ? ((JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string }).sub ?? '') : '';
}

const model = (id: string, isDefault: boolean): aiV1.ModelInfo => ({
    id,
    name: id,
    description: `model ${id}`,
    provider: 'test',
    runtimeModelName: id,
    badge: isDefault ? 'Mặc định' : '',
    disabled: false,
    isDefault,
    supportsStructuredOutput: true,
    specs: [{ label: 'Provider', value: 'test' }],
    available: true,
});

/** The synchronous half of ai-service content uses: `ListModels`, service tokens only (`svc:content`). */
export async function startFakeAi(): Promise<FakeAi> {
    const state = { callers: [] as string[], down: { value: false } };

    @Controller()
    class FakeAiController {
        constructor(@Inject(STATE) private readonly s: typeof state) {}

        @GrpcMethod('AiService', 'ListModels')
        listModels(_req: aiV1.ListModelsRequest, md: Metadata): aiV1.ListModelsResponse {
            const caller = subOf(md);
            this.s.callers.push(caller);
            if (caller !== 'svc:content') throw new RpcException({ code: status.PERMISSION_DENIED, message: 'PERMISSION_DENIED' });
            if (this.s.down.value) throw new RpcException({ code: status.UNAVAILABLE, message: 'down' });
            return {
                embeddingModel: model('embed-1', true),
                generationModels: [model('gen-a', true), model('gen-b', false)],
                defaultGenerationModel: 'gen-a',
            };
        }
    }

    const moduleRef = await Test.createTestingModule({
        controllers: [FakeAiController],
        providers: [{ provide: STATE, useValue: state }],
    }).compile();
    const server = await startTestGrpcServer(moduleRef, [PROTO_FILES.ai]);
    return { ...state, server, close: () => server.close() };
}
