import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { PROTO_FILES } from '@examio/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@examio/grpc/testing';
import type { PrismaService } from '@examio/database';

/** What the fake auth directory was asked, so specs can assert "one RPC per request". */
export interface FakeAuthCalls {
    profileBatches: string[][];
    searches: Array<{ query: string; limit: number; authorization?: string }>;
}

export interface FakeAuth {
    server: TestGrpcServer;
    calls: FakeAuthCalls;
    /** The exam e2e harness seeds `user` rows; the fake directory reads them. */
    bind(prisma: PrismaService): void;
    reset(): void;
}

const projection = (u: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
}) => ({
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
    const holder: { prisma?: PrismaService } = {};

    @Controller()
    class FakeAuthController {
        @GrpcMethod('AuthService', 'GetPublicProfilesByIds')
        async getPublicProfilesByIds(req: { userIds: string[] }) {
            calls.profileBatches.push([...req.userIds]);
            const rows = await holder.prisma!.user.findMany({
                where: { id: { in: req.userIds }, deletedAt: null },
                select: { id: true, username: true, name: true, avatar: true },
            });
            const byId = new Map(rows.map((r) => [r.id, r]));
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
            const rows = await holder.prisma!.user.findMany({
                where: {
                    deletedAt: null,
                    // prefix on username/name, EXACT email (never returned)
                    OR: [
                        { username: { startsWith: req.query, mode: 'insensitive' } },
                        { name: { startsWith: req.query, mode: 'insensitive' } },
                        { email: { equals: req.query, mode: 'insensitive' } },
                    ],
                },
                select: { id: true, username: true, name: true, avatar: true },
                take: req.limit || 20,
            });
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
        bind: (prisma) => {
            holder.prisma = prisma;
        },
        reset: () => {
            calls.profileBatches.length = 0;
            calls.searches.length = 0;
        },
    };
}
