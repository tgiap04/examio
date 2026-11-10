import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { PROTO_FILES, r2V1 } from '@examio/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@examio/grpc/testing';

export interface R2Call {
    rpc: 'DeleteObjects';
    keys: string[];
    /** `sub` of the bearer token (`svc:content` for the worker). */
    caller: string;
}

export interface FakeR2 {
    server: TestGrpcServer;
    calls: R2Call[];
    close(): Promise<void>;
}

function subOf(metadata: Metadata): string {
    const bearer = String(metadata.get('authorization')[0] ?? '').replace(/^Bearer /, '');
    const payload = bearer.split('.')[1];
    return payload ? ((JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string }).sub ?? '') : '';
}

/** A tiny r2-service that records `DeleteObjects` (the only R2 call content's worker makes). */
export async function startFakeR2(): Promise<FakeR2> {
    const calls: R2Call[] = [];

    @Controller()
    class FakeR2Controller {
        @GrpcMethod('R2Service', 'DeleteObjects')
        delete(data: r2V1.DeleteObjectsRequest, md: Metadata): r2V1.DeleteObjectsResponse {
            calls.push({ rpc: 'DeleteObjects', keys: data.keys, caller: subOf(md) });
            return { deletedCount: data.keys.length, failedKeys: [] };
        }
    }

    const moduleRef = await Test.createTestingModule({ controllers: [FakeR2Controller] }).compile();
    const server = await startTestGrpcServer(moduleRef, [PROTO_FILES.r2]);
    return { server, calls, close: () => server.close() };
}
