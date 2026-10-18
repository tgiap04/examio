import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { authV1, PROTO_FILES } from '@examio/contracts';
import { GrpcClientModule } from '@examio/grpc';
import { startTestGrpcServer, TestGrpcServer } from '@examio/grpc/testing';
import { ServiceMetadata, ServiceTokenClient } from '@examio/auth-jwt';
import { AUTH_GRPC_REGISTRATION, AuthClient } from '../src/clients/auth.client';
import { ReconcileTeachers } from '../src/commands/reconcile-teachers';

const TEACHERS = Array.from({ length: 5 }, (_, i) => `t${i + 1}`);
const seen: Array<{ request: authV1.ListUsersRequest; authorization: string[] }> = [];

/** Stand-in auth server: pages TEACHERS and records what it was called with. */
@Controller()
class FakeAuthServer {
    @GrpcMethod('AuthService', 'ListUsers')
    listUsers(request: authV1.ListUsersRequest, metadata: Metadata): authV1.ListUsersResponse {
        seen.push({ request, authorization: metadata.get('authorization').map(String) });
        // The server caps the page size at 2 whatever the caller asks for.
        const limit = Math.min(request.limit || 2, 2);
        const page = request.page || 1;
        const slice = TEACHERS.slice((page - 1) * limit, page * limit);
        return {
            users: slice.map((id) => ({
                id, email: `${id}@x`, username: id, name: '', avatar: '', role: authV1.BaseRole.BASE_ROLE_TEACHER,
                isSystemAdmin: false, isVerified: true, isBanned: false, createdAt: '0',
            })),
            page: { total: TEACHERS.length, page, limit },
        };
    }
}

describe('finance AuthClient.listUsers over a real in-process gRPC server', () => {
    let server: TestGrpcServer;
    let module: { close(): Promise<void> };
    let client: AuthClient;
    let reconcile: ReconcileTeachers;
    const audiencesRequested: string[] = [];
    const ensure = jest.fn(async (_id: string) => ({ created: true }));

    beforeAll(async () => {
        const serverModule = await Test.createTestingModule({ controllers: [FakeAuthServer] }).compile();
        server = await startTestGrpcServer(serverModule, [PROTO_FILES.auth]);
        process.env[AUTH_GRPC_REGISTRATION.urlEnv] = server.url;

        const m = await Test.createTestingModule({
            imports: [GrpcClientModule.register(AUTH_GRPC_REGISTRATION)],
            providers: [
                AuthClient,
                {
                    provide: ServiceMetadata,
                    useValue: new ServiceMetadata(
                        new ServiceTokenClient({
                            fetch: async (audience) => {
                                audiencesRequested.push(audience);
                                return { token: `svc-finance-for-${audience}`, expiresAt: Date.now() + 300_000 };
                            },
                        })
                    ),
                },
                { provide: 'ENSURE', useValue: { ensure } },
                {
                    provide: ReconcileTeachers,
                    useFactory: (auth: AuthClient) => new ReconcileTeachers(auth, { ensure } as never),
                    inject: [AuthClient],
                },
            ],
        }).compile();
        await m.init();
        module = m;
        client = m.get(AuthClient);
        reconcile = m.get(ReconcileTeachers);
    });

    afterAll(async () => {
        await module.close();
        await server.close();
        delete process.env[AUTH_GRPC_REGISTRATION.urlEnv];
    });

    beforeEach(() => {
        seen.length = 0;
        ensure.mockClear();
    });

    it('calls ListUsers as svc:finance with a service token minted for audience "auth"', async () => {
        const res = await client.listUsers({ query: '', role: authV1.BaseRole.BASE_ROLE_TEACHER, page: 1, limit: 2 });
        expect(res.users.map((u) => u.id)).toEqual(['t1', 't2']);
        expect(seen[0].authorization).toEqual(['Bearer svc-finance-for-auth']);
        expect(seen[0].request).toMatchObject({ role: authV1.BaseRole.BASE_ROLE_TEACHER, page: 1, limit: 2 });
        expect(audiencesRequested.every((a) => a === 'auth')).toBe(true);
    });

    it('pages through every teacher and ensures a wallet per teacher (reconcile-teachers)', async () => {
        ensure.mockImplementation(async (id: string) => ({ created: id !== 't3' }));
        const result = await reconcile.run();
        expect(result).toEqual({ teachers: 5, created: 4 });
        expect(ensure.mock.calls.map((c) => c[0])).toEqual(TEACHERS);
        // Pages are requested role=TEACHER with a bounded page size, ascending page numbers, stops at the total.
        expect(seen.every((s) => s.request.role === authV1.BaseRole.BASE_ROLE_TEACHER)).toBe(true);
        expect(seen.map((s) => s.request.page)).toEqual([1, 2, 3]);
        expect(seen.every((s) => s.authorization[0] === 'Bearer svc-finance-for-auth')).toBe(true);
    });

    it('the service token is cached: one mint serves many calls', async () => {
        const before = audiencesRequested.length;
        await client.listUsers({ query: '', page: 1, limit: 1 });
        await client.listUsers({ query: '', page: 2, limit: 1 });
        expect(audiencesRequested.length).toBe(before);
    });
});
