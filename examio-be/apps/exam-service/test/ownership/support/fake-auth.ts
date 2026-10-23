import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { PROTO_FILES } from '@examio/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@examio/grpc/testing';

/** An account of the fake auth directory (the only fields exam ever sees). */
export interface FakeAuthUser {
    id: string;
    username: string;
    email?: string;
    name?: string | null;
    avatar?: string | null;
    deletedAt?: Date | null;
}

/** What the fake auth directory was asked, so specs can assert "one RPC per request". */
export interface FakeAuthCalls {
    profileBatches: string[][];
    searches: Array<{ query: string; limit: number; authorization?: string }>;
}

export interface FakeAuth {
    server: TestGrpcServer;
    calls: FakeAuthCalls;
    /** Registers an account in the fake directory (exam has no `User` table: auth owns it). */
    addUser(user: FakeAuthUser): void;
    /** Marks an account deleted: auth then answers as if it did not exist. */
    removeUser(id: string): void;
    reset(): void;
}

const projection = (u: FakeAuthUser) => ({
    id: u.id,
    username: u.username,
    name: u.name ?? '',
    avatar: u.avatar ?? '',
});

/**
 * Stands in for auth-service: serves exactly the two RPCs exam calls, with the
 * real wire contracts (`GetPublicProfilesByIds`, `SearchUsers`). Never returns
 * an email, like the real server.
 */
export async function startFakeAuth(): Promise<FakeAuth> {
    const calls: FakeAuthCalls = { profileBatches: [], searches: [] };
    const directory = new Map<string, FakeAuthUser>();

    @Controller()
    class FakeAuthController {
        @GrpcMethod('AuthService', 'GetPublicProfilesByIds')
        async getPublicProfilesByIds(req: { userIds: string[] }) {
            calls.profileBatches.push([...req.userIds]);
            const byId = new Map(
                req.userIds.flatMap((id) => {
                    const u = directory.get(id);
                    return u && !u.deletedAt ? [[id, u] as const] : [];
                })
            );
            return {
                profiles: req.userIds.flatMap((id) =>
                    byId.has(id) ? [projection(byId.get(id)!)] : []
                ),
            };
        }

        @GrpcMethod('AuthUserService', 'SearchUsers')
        async searchUsers(
            req: { query: string; limit: number },
            md: { get(k: string): unknown[] }
        ) {
            calls.searches.push({
                ...req,
                authorization: String(md.get('authorization')[0] ?? ''),
            });
            const q = req.query.toLowerCase();
            const rows = [...directory.values()]
                .filter((u) => !u.deletedAt)
                // prefix on username/name, EXACT email (never returned)
                .filter(
                    (u) =>
                        u.username.toLowerCase().startsWith(q) ||
                        (u.name ?? '').toLowerCase().startsWith(q) ||
                        (u.email ?? '').toLowerCase() === q
                )
                .slice(0, req.limit || 20);
            return { profiles: rows.map(projection) };
        }
    }

    const moduleRef = await Test.createTestingModule({
        controllers: [FakeAuthController],
    }).compile();
    const server = await startTestGrpcServer(moduleRef, [
        PROTO_FILES.auth,
        PROTO_FILES.authUsers,
    ]);
    return {
        server,
        calls,
        addUser: (user) => {
            directory.set(user.id, user);
        },
        removeUser: (id) => {
            const u = directory.get(id);
            if (u) directory.set(id, { ...u, deletedAt: new Date() });
        },
        reset: () => {
            calls.profileBatches.length = 0;
            calls.searches.length = 0;
        },
    };
}
