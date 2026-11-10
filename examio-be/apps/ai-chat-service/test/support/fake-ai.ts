import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { Observable } from 'rxjs';
import { PROTO_FILES, aiV1 } from '@examio/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@examio/grpc/testing';
import { callerOf } from './token-claims';

export interface AiCall {
    rpc: 'Query' | 'StreamChat';
    /** `sub` of the bearer token. */
    caller: string;
    audience: string[];
    request: Record<string, unknown>;
}

/** What the next `StreamChat` does. */
export interface StreamScript {
    chunks?: string[];
    chunkDelayMs?: number;
    /** After the chunks: finish with `done` (default), never finish, an in-band `error` frame, or a gRPC status. */
    end?: 'done' | 'hang' | 'error-frame' | { status: number; details?: string };
    /** Fail with a gRPC status before the first frame (the call itself is refused). */
    failBeforeFirstFrame?: { code: number; details?: string };
}

export interface FakeAi {
    server: TestGrpcServer;
    calls: AiCall[];
    /** How many StreamChat calls the server saw CANCELLED by the client. */
    cancelled: { count: number };
    script: StreamScript;
    /** The next `Query` answers this text, or fails with the gRPC status. */
    query: { answer: string; fail?: { code: number; details?: string } };
    reset(): void;
    close(): Promise<void>;
}

const STATE = Symbol('FAKE_AI_STATE');

const refuse = (code: number, message: string) => new RpcException({ code, message });

/**
 * The synchronous half of ai-service ai-chat uses (`Query`, `StreamChat`) over REAL gRPC, with the
 * same trust rule as the Python server: only a service token of `svc:ai-chat` for audience `ai`
 * (a user token is PERMISSION_DENIED, no token UNAUTHENTICATED).
 */
export async function startFakeAi(): Promise<FakeAi> {
    const state = {
        calls: [] as AiCall[],
        cancelled: { count: 0 },
        script: {} as StreamScript,
        query: { answer: 'fake answer' } as FakeAi['query'],
    };

    @Controller()
    class FakeAiController {
        constructor(@Inject(STATE) private readonly s: typeof state) {}

        private enter(rpc: AiCall['rpc'], md: Metadata, request: object): void {
            const caller = callerOf(md);
            this.s.calls.push({ rpc, caller: caller.sub, audience: caller.aud, request: { ...request } });
            if (!caller.sub) throw refuse(status.UNAUTHENTICATED, 'UNAUTHENTICATED');
            if (caller.sub !== 'svc:ai-chat' || !caller.aud.includes('ai')) throw refuse(status.PERMISSION_DENIED, 'PERMISSION_DENIED');
        }

        @GrpcMethod('AiService', 'Query')
        query(req: aiV1.QueryRequest, md: Metadata): aiV1.QueryResponse {
            this.enter('Query', md, req);
            if (this.s.query.fail) throw refuse(this.s.query.fail.code, this.s.query.fail.details ?? 'fail');
            return { answer: this.s.query.answer, sources: [], timestamp: String(Date.now()) };
        }

        @GrpcMethod('AiService', 'StreamChat')
        streamChat(req: aiV1.StreamChatRequest, md: Metadata, call: { on(event: string, fn: () => void): void }): Observable<aiV1.StreamChatResponse> {
            this.enter('StreamChat', md, req);
            const script = { ...this.s.script };
            if (script.failBeforeFirstFrame) {
                throw refuse(script.failBeforeFirstFrame.code, script.failBeforeFirstFrame.details ?? 'fail');
            }
            return new Observable<aiV1.StreamChatResponse>((observer) => {
                let stopped = false;
                const sawCancel = () => {
                    if (stopped) return;
                    stopped = true;
                    this.s.cancelled.count += 1;
                };
                call.on('cancelled', sawCancel);
                const timers: NodeJS.Timeout[] = [];
                observer.next({ started: {} });
                const chunks = script.chunks ?? [];
                const step = script.chunkDelayMs ?? 0;
                chunks.forEach((chunk, i) => timers.push(setTimeout(() => !stopped && observer.next({ chunk }), step * (i + 1))));
                const finishAt = step * (chunks.length + 1);
                timers.push(
                    setTimeout(() => {
                        if (stopped) return;
                        const end = script.end ?? 'done';
                        if (end === 'hang') return;
                        if (end === 'error-frame') {
                            observer.next({ error: { message: 'model fell over (ref e2e)', code: 'MODEL_RUNTIME_ERROR' } });
                        } else if (typeof end === 'object') {
                            observer.error(refuse(end.status, end.details ?? 'fail'));
                            return;
                        } else {
                            observer.next({
                                done: { assistantMessage: { role: 'assistant', content: chunks.join('') }, createdAt: String(Date.now()), sources: [] },
                            });
                        }
                        observer.complete();
                    }, finishAt)
                );
                return () => timers.forEach(clearTimeout);
            });
        }
    }

    const moduleRef = await Test.createTestingModule({
        controllers: [FakeAiController],
        providers: [{ provide: STATE, useValue: state }],
    }).compile();
    const server = await startTestGrpcServer(moduleRef, [PROTO_FILES.ai]);
    return {
        calls: state.calls,
        cancelled: state.cancelled,
        get script() {
            return state.script;
        },
        set script(value: StreamScript) {
            state.script = value;
        },
        query: state.query,
        server,
        reset() {
            state.calls.length = 0;
            state.cancelled.count = 0;
            state.script = {};
            state.query.answer = 'fake answer';
            delete state.query.fail;
        },
        close: () => server.close(),
    };
}
