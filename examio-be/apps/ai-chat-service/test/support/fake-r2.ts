import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { PROTO_FILES, r2V1 } from '@examio/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@examio/grpc/testing';
import { callerOf } from './token-claims';

export interface R2Call {
    keys: string[];
    caller: string;
}

export interface FakeR2 {
    server: TestGrpcServer;
    calls: R2Call[];
    close(): Promise<void>;
}

const STATE = Symbol('FAKE_R2_STATE');

/** The r2-service half ai-chat uses: `DeleteObjects` (the worker, as `svc:ai-chat`). */
export async function startFakeR2(): Promise<FakeR2> {
    const state = { calls: [] as R2Call[] };

    @Controller()
    class FakeR2Controller {
        constructor(@Inject(STATE) private readonly s: typeof state) {}

        @GrpcMethod('R2Service', 'DeleteObjects')
        delete(data: r2V1.DeleteObjectsRequest, md: Metadata): r2V1.DeleteObjectsResponse {
            this.s.calls.push({ keys: data.keys, caller: callerOf(md).sub });
            return { deletedCount: data.keys.length, failedKeys: [] };
        }
    }

    const moduleRef = await Test.createTestingModule({
        controllers: [FakeR2Controller],
        providers: [{ provide: STATE, useValue: state }],
    }).compile();
    const server = await startTestGrpcServer(moduleRef, [PROTO_FILES.r2]);
    return { ...state, server, close: () => server.close() };
}
