// Test-only helpers: boot an in-process gRPC server from a Nest testing module
// and talk to it through a real generated-style client. Not exported from index.
import { createServer } from 'net';
import { ClientGrpc, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { INestMicroservice } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { GrpcProtoRef, grpcServerOptions } from './grpc-client.module';
import { PROTO_LOADER_OPTIONS, resolveProtoRoot } from './proto-paths';
import { join } from 'path';

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = createServer();
        srv.once('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address() as { port: number };
            srv.close(() => resolve(port));
        });
    });
}

export interface TestGrpcServer {
    app: INestMicroservice;
    url: string;
    close(): Promise<void>;
}

export async function startTestGrpcServer(
    moduleRef: TestingModule,
    protos: GrpcProtoRef[]
): Promise<TestGrpcServer> {
    const port = await freePort();
    const previous = process.env.GRPC_PORT;
    process.env.GRPC_PORT = String(port);
    try {
        const app = moduleRef.createNestMicroservice(grpcServerOptions(protos));
        await app.listen();
        return { app, url: `127.0.0.1:${port}`, close: () => app.close() };
    } finally {
        if (previous === undefined) delete process.env.GRPC_PORT;
        else process.env.GRPC_PORT = previous;
    }
}

export function createTestGrpcClient(url: string, protos: GrpcProtoRef[]): ClientGrpc {
    const root = resolveProtoRoot();
    return ClientProxyFactory.create({
        transport: Transport.GRPC,
        options: {
            package: [...new Set(protos.map((p) => p.pkg))],
            protoPath: protos.map((p) => join(root, p.file)),
            url,
            loader: { ...PROTO_LOADER_OPTIONS, includeDirs: [root] },
        },
    }) as unknown as ClientGrpc;
}
