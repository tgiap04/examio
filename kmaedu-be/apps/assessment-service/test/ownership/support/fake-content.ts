import { createHash } from 'crypto';
import { Controller, Inject } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { PROTO_FILES, contentV1 } from '@kmaedu/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@kmaedu/grpc/testing';

export interface FakeQuestion {
    id: string;
    question: string;
    options: string[];
    answer: string;
    labelId: string | null;
}

export interface FakeLabel {
    id: string;
    name: string;
    order: number;
    color?: string;
}

export interface FakeQuizSet {
    id: string;
    ownerId: string;
    title: string;
    labels: FakeLabel[];
    questions: FakeQuestion[];
}

export interface ContentCall {
    rpc: string;
    /** `sub` of the bearer token (a `svc:*` subject is refused like the real service does). */
    caller: string;
    ids?: string[];
    withContentHash?: boolean;
}

export interface SeedQuestion {
    question: string;
    options?: string[];
    answer?: string;
    label?: string;
}

export interface SeededQuizSet {
    id: string;
    labelIds: Map<string, string>;
    questionIds: string[];
}

/** What every content backend of the assessment harness offers (the fake here, or the real service in test/cross-app). */
export interface ContentBackend {
    grpcUrl: string;
    close(): Promise<void>;
}

export interface FakeContent extends ContentBackend {
    server: TestGrpcServer;
    calls: ContentCall[];
    sets: Map<string, FakeQuizSet>;
    /** Flashcard sets per owner, as `GetUserContentStats` reports them. */
    flashcardSets: Map<string, number>;
    /** Fails the next call of `rpc` with this gRPC status. */
    fault(rpc: string, code: number, details: string): void;
    addQuizSet(ownerId: string, labels?: string[], questions?: SeedQuestion[]): SeededQuizSet;
    editQuestion(setId: string, questionId: string, patch: Partial<Pick<FakeQuestion, 'question' | 'options' | 'answer'>>): void;
    addQuestion(setId: string, q: SeedQuestion): string;
    removeQuestion(setId: string, questionId: string): void;
    rename(setId: string, title: string): void;
    remove(setId: string): void;
    count(rpc: string): number;
    /** The hash content would report for the set right now. */
    hashOf(setId: string): string;
}

const STATE = Symbol('FAKE_CONTENT_STATE');
let counter = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(++counter).toString(36)}`;

interface Claims {
    sub: string;
    roles: string[];
}

function claimsOf(metadata: Metadata): Claims {
    const bearer = String(metadata.get('authorization')[0] ?? '').replace(/^Bearer /, '');
    const payload = bearer.split('.')[1];
    if (!payload) return { sub: '', roles: [] };
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<Claims>;
    return { sub: claims.sub ?? '', roles: claims.roles ?? [] };
}

const fail = (code: number, details: string) => new RpcException({ code, message: details });

/** Same idea as content's `computeContentHash`: equal content, equal hash; the title is outside it. */
function hashOfSet(set: FakeQuizSet): string {
    const labels = [...set.labels].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    return createHash('sha256')
        .update(JSON.stringify({ labels, questions: set.questions.map((q, order) => ({ ...q, order })) }))
        .digest('hex');
}

/**
 * A content-service over real gRPC with the contract assessment relies on: the owner is the `sub` of the
 * forwarded USER token (a service token is PERMISSION_DENIED, none UNAUTHENTICATED); a set that is not
 * the caller's is NOT_FOUND (or omitted); `quizset:manage` (TEACHER) is needed for snapshots and
 * summaries, any verified user may ask for their stats; at most 50 ids per summary call.
 * The real thing runs behind the same wire in `test/cross-app/assessment-real-content.e2e-spec.ts`.
 */
export async function startFakeContent(): Promise<FakeContent> {
    const state = {
        calls: [] as ContentCall[],
        sets: new Map<string, FakeQuizSet>(),
        flashcardSets: new Map<string, number>(),
        faults: new Map<string, Array<{ code: number; details: string }>>(),
    };

    @Controller()
    class FakeContentController {
        constructor(@Inject(STATE) private readonly s: typeof state) {}

        private enter(rpc: string, md: Metadata, needsManage: boolean, extra: Partial<ContentCall> = {}): string {
            const { sub, roles } = claimsOf(md);
            this.s.calls.push({ rpc, caller: sub, ...extra });
            if (!sub) throw fail(status.UNAUTHENTICATED, 'UNAUTHENTICATED');
            if (sub.startsWith('svc:')) throw fail(status.PERMISSION_DENIED, 'PERMISSION_DENIED');
            if (needsManage && !roles.includes('TEACHER')) throw fail(status.PERMISSION_DENIED, 'PERMISSION_DENIED');
            const fault = this.s.faults.get(rpc)?.shift();
            if (fault) throw fail(fault.code, fault.details);
            return sub;
        }

        private owned(ownerId: string, ids: string[]): FakeQuizSet[] {
            return [...new Set(ids)].flatMap((id) => {
                const set = this.s.sets.get(id);
                return set && set.ownerId === ownerId ? [set] : [];
            });
        }

        @GrpcMethod('ContentService', 'GetQuizSetSnapshot')
        getQuizSetSnapshot(req: contentV1.GetQuizSetSnapshotRequest, md: Metadata): contentV1.QuizSetSnapshot {
            const owner = this.enter('GetQuizSetSnapshot', md, true, { ids: [req.quizSetId] });
            const [set] = this.owned(owner, [req.quizSetId]);
            if (!set) throw fail(status.NOT_FOUND, 'NOT_FOUND');
            return {
                schemaVersion: 1,
                quizSetId: set.id,
                title: set.title,
                ownerId: set.ownerId,
                takenAt: new Date().toISOString(),
                contentHash: hashOfSet(set),
                labels: set.labels.map((l) => ({ id: l.id, name: l.name, order: l.order, color: l.color })),
                questions: set.questions.map((q, order) => ({
                    id: q.id,
                    question: q.question,
                    options: q.options,
                    answer: q.answer,
                    labelId: q.labelId ?? undefined,
                    order,
                })),
            };
        }

        @GrpcMethod('ContentService', 'GetQuizSetsByIds')
        getQuizSetsByIds(req: contentV1.GetQuizSetsByIdsRequest, md: Metadata): contentV1.GetQuizSetsByIdsResponse {
            const owner = this.enter('GetQuizSetsByIds', md, true, { ids: req.ids, withContentHash: req.withContentHash });
            if (req.ids.length > 50) throw fail(status.INVALID_ARGUMENT, 'at most 50 ids per call');
            return {
                quizSets: this.owned(owner, req.ids).map((s) => ({
                    id: s.id,
                    title: s.title,
                    questionCount: s.questions.length,
                    contentHash: req.withContentHash ? hashOfSet(s) : undefined,
                })),
            };
        }

        @GrpcMethod('ContentService', 'GetUserContentStats')
        getUserContentStats(_req: contentV1.GetUserContentStatsRequest, md: Metadata): contentV1.UserContentStats {
            const owner = this.enter('GetUserContentStats', md, false);
            return {
                quizSetCount: [...this.s.sets.values()].filter((s) => s.ownerId === owner).length,
                flashcardSetCount: this.s.flashcardSets.get(owner) ?? 0,
            };
        }
    }

    const moduleRef = await Test.createTestingModule({
        controllers: [FakeContentController],
        providers: [{ provide: STATE, useValue: state }],
    }).compile();
    const server = await startTestGrpcServer(moduleRef, [PROTO_FILES.content]);

    const must = (id: string): FakeQuizSet => {
        const set = state.sets.get(id);
        if (!set) throw new Error(`no fake quiz set ${id}`);
        return set;
    };
    const makeQuestion = (set: FakeQuizSet, q: SeedQuestion): FakeQuestion => ({
        id: nextId('qq'),
        question: q.question,
        options: q.options ?? ['a', 'b', 'c', 'd'],
        answer: q.answer ?? 'A',
        labelId: q.label ? (set.labels.find((l) => l.name === q.label)?.id ?? null) : null,
    });

    return {
        ...state,
        server,
        grpcUrl: server.url,
        count: (rpc) => state.calls.filter((c) => c.rpc === rpc).length,
        fault(rpc, code, details) {
            const list = state.faults.get(rpc) ?? [];
            list.push({ code, details });
            state.faults.set(rpc, list);
        },
        addQuizSet(ownerId, labels = [], questions = [{ question: 'Capital of France?', options: ['Paris', 'Rome'], answer: 'A' }]) {
            const id = nextId('qs');
            const set: FakeQuizSet = {
                id,
                ownerId,
                title: `quiz ${id}`,
                labels: labels.map((name, order) => ({ id: nextId('ql'), name, order, color: '#336699' })),
                questions: [],
            };
            set.questions = questions.map((q) => makeQuestion(set, q));
            state.sets.set(id, set);
            return {
                id,
                labelIds: new Map(set.labels.map((l) => [l.name, l.id])),
                questionIds: set.questions.map((q) => q.id),
            };
        },
        editQuestion(setId, questionId, patch) {
            const q = must(setId).questions.find((x) => x.id === questionId);
            if (!q) throw new Error(`no fake question ${questionId}`);
            Object.assign(q, patch);
        },
        addQuestion(setId, q) {
            const set = must(setId);
            const row = makeQuestion(set, q);
            set.questions.push(row);
            return row.id;
        },
        removeQuestion(setId, questionId) {
            const set = must(setId);
            set.questions = set.questions.filter((q) => q.id !== questionId);
        },
        rename(setId, title) {
            must(setId).title = title;
        },
        remove(setId) {
            state.sets.delete(setId);
        },
        hashOf: (setId) => hashOfSet(must(setId)),
        close: () => server.close(),
    };
}
