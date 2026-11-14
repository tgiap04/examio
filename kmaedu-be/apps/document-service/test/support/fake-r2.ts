import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { PROTO_FILES, r2V1 } from '@kmaedu/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@kmaedu/grpc/testing';

export interface R2Call {
    rpc: 'UploadFile' | 'CreatePresignedDownload' | 'DeleteObjects';
    /** Folder + filename for uploads, the key for presigns, the keys for deletes. */
    keys: string[];
    caller: string;
}

export interface FakeR2 {
    server: TestGrpcServer;
    calls: R2Call[];
    uploaded: Map<string, Buffer>;
    deleted: string[];
    /** Makes the next UploadFile answer `success: false`. */
    failNextUpload: { value: boolean };
    close(): Promise<void>;
}

const STATE = Symbol('FAKE_R2_STATE');

function subOf(metadata: Metadata): string {
    const bearer = String(metadata.get('authorization')[0] ?? '').replace(/^Bearer /, '');
    const payload = bearer.split('.')[1];
    return payload ? ((JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string }).sub ?? '') : '';
}

/** A tiny r2-service: stores uploads in memory, signs `https://r2.test/signed/<key>`, records deletes. */
export async function startFakeR2(): Promise<FakeR2> {
    const state = {
        calls: [] as R2Call[],
        uploaded: new Map<string, Buffer>(),
        deleted: [] as string[],
        failNextUpload: { value: false },
    };

    @Controller()
    class FakeR2Controller {
        constructor(@Inject(STATE) private readonly s: typeof state) {}

        @GrpcMethod('R2Service', 'UploadFile')
        upload(data: r2V1.UploadFileRequest, md: Metadata): r2V1.UploadFileResponse {
            const key = `${data.folder}/${data.filename}`;
            this.s.calls.push({ rpc: 'UploadFile', keys: [key], caller: subOf(md) });
            if (this.s.failNextUpload.value) {
                this.s.failNextUpload.value = false;
                return { success: false, fileId: '', url: '', keyR2: '', message: 'r2 down' };
            }
            this.s.uploaded.set(key, Buffer.from(data.content));
            return { success: true, fileId: key, url: `https://r2.test/${key}`, keyR2: key, message: 'ok' };
        }

        @GrpcMethod('R2Service', 'CreatePresignedDownload')
        presign(data: r2V1.CreatePresignedDownloadRequest, md: Metadata): r2V1.CreatePresignedDownloadResponse {
            this.s.calls.push({ rpc: 'CreatePresignedDownload', keys: [data.key], caller: subOf(md) });
            return { url: `https://r2.test/signed/${data.key}?ttl=${data.expiresInSeconds}`, expiresAt: String(Date.now() + 3600_000) };
        }

        @GrpcMethod('R2Service', 'DeleteObjects')
        delete(data: r2V1.DeleteObjectsRequest, md: Metadata): r2V1.DeleteObjectsResponse {
            this.s.calls.push({ rpc: 'DeleteObjects', keys: data.keys, caller: subOf(md) });
            this.s.deleted.push(...data.keys);
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
