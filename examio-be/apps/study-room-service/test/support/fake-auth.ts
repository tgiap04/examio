import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { PROTO_FILES } from '@examio/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@examio/grpc/testing';

/** An account of the fake auth directory (the only fields study-room ever sees). */
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
}

export interface FakeAuth {
    server: TestGrpcServer;
    calls: FakeAuthCalls;
    /** Registers an account in the fake directory (study-room has no `User` table: auth owns it). */
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
 * Stands in for auth-service: serves the one RPC study-room calls, with the
 * real wire contract (`GetPublicProfilesByIds`). Never returns
 * an email, like the real server.
 */
export async function startFakeAuth(): Promise<FakeAuth> {
    const calls: FakeAuthCalls = { profileBatches: [] };
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
    }

    const moduleRef = await Test.createTestingModule({
        controllers: [FakeAuthController],
    }).compile();
    const server = await startTestGrpcServer(moduleRef, [PROTO_FILES.auth]);
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
        },
    };
}
