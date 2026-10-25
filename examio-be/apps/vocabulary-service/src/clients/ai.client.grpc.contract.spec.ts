import { Test } from '@nestjs/testing';
import { Metadata, status } from '@grpc/grpc-js';
import { PROTO_FILES, aiV1 } from '@examio/contracts';
import { GrpcClientModule } from '@examio/grpc';
import { createTestGrpcClient } from '@examio/grpc/testing';
import { ServiceMetadata } from '@examio/auth-jwt';
import { startFakeAiService, type FakeAiService } from '../../test/support/fake-ai-service';

const PAYLOAD = { categorySlug: 'food', categoryName: 'Food', numRootWords: 1, excludeRootWords: ['eat'] };

/** AiClient <-> a grpc-js AiService that enforces the service token like ai-service does. */
describe('vocabulary AiClient (gRPC contract)', () => {
    let fake: FakeAiService;
    let client: import('./ai.client').AiClient;
    let attach: jest.Mock;

    beforeAll(async () => {
        fake = await startFakeAiService();
        process.env.AI_GRPC_URL = fake.url;
        const { AI_GRPC_REGISTRATION, AiClient } = await import('./ai.client');
        attach = jest.fn(async (md: Metadata, audience: string) => {
            const copy = md.clone();
            copy.set('authorization', `Bearer token-for-${audience}`);
            return copy;
        });
        const moduleRef = await Test.createTestingModule({
            imports: [GrpcClientModule.register(AI_GRPC_REGISTRATION)],
            providers: [AiClient, { provide: ServiceMetadata, useValue: { attach } }],
        }).compile();
        await moduleRef.init();
        client = moduleRef.get(AiClient);
    });
    afterAll(async () => {
        await fake.close();
    });
    beforeEach(() => {
        fake.requests.length = 0;
        fake.failNext.value = null;
    });

    it('sends a service token for audience ai and maps the response', async () => {
        const res = await client.generateWordFamily(PAYLOAD);
        expect(attach).toHaveBeenCalledWith(expect.any(Metadata), 'ai');
        expect(fake.requests[0]).toMatchObject({ authorization: 'Bearer token-for-ai', body: { categorySlug: 'food', excludeRootWords: ['eat'] } });
        expect(res).toMatchObject({ success: true, data: { rootWord: 'order', categorySlug: 'food' } });
    });

    it('a call without a token is UNAUTHENTICATED', async () => {
        const raw = createTestGrpcClient(fake.url, [PROTO_FILES.ai]).getService<aiV1.AiServiceClient>(aiV1.AI_SERVICE_NAME);
        const err = await new Promise<{ code: number }>((resolve, reject) =>
            raw.generateWordFamily(PAYLOAD as aiV1.GenerateWordFamilyRequest, new Metadata()).subscribe({
                next: () => reject(new Error('expected UNAUTHENTICATED')),
                error: resolve,
            })
        );
        expect(err.code).toBe(status.UNAUTHENTICATED);
    });

    it('UNAUTHENTICATED from ai-service is rethrown, not turned into a generation failure', async () => {
        attach.mockImplementationOnce(async (md: Metadata) => md.clone());
        await expect(client.generateWordFamily(PAYLOAD)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
    });

    it.each([
        ['model error', { code: status.UNAVAILABLE, message: 'x', errorCode: 'MODEL_UNAVAILABLE' }, /MODEL_UNAVAILABLE/],
        ['invalid argument', { code: status.INVALID_ARGUMENT, message: 'num_root_words must be 1..20' }, /num_root_words/],
        ['internal', { code: status.INTERNAL, message: 'error ref abc123' }, /thất bại/],
    ])('maps %s to success:false', async (_n, failure, text) => {
        fake.failNext.value = failure;
        const res = await client.generateWordFamily(PAYLOAD);
        expect(res.success).toBe(false);
        expect(res.error).toMatch(text);
    });

    it('UNAVAILABLE without a model code is rethrown and not retried', async () => {
        fake.failNext.value = { code: status.UNAVAILABLE, message: 'down' };
        await expect(client.generateWordFamily(PAYLOAD)).rejects.toMatchObject({ code: status.UNAVAILABLE });
        expect(fake.requests).toHaveLength(1);
    });
});
