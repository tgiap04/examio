import 'reflect-metadata';
import { INestApplication, Injectable, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthJwtModule } from '@examio/auth-jwt';
import { FlashcardSetOwnerResolver } from '../../apps/content-service/src/modules/flashcardset/flashcardset-owner.resolver';
import { QuizSetOwnerResolver } from '../../apps/content-service/src/modules/quizset/quizset-owner.resolver';
import { ContentServiceModule } from '../../apps/content-service/src/content-service.module';
import { AssessmentServiceModule } from '../../apps/assessment-service/src/assessment-service.module';
import { StudyRoomServiceModule } from '../../apps/study-room-service/src/study-room-service.module';
import { VocabularyServiceModule } from '../../apps/vocabulary-service/src/vocabulary-service.module';
import { DocumentServiceModule } from '../../apps/document-service/src/document-service.module';
import { AIChatServiceModule } from '../../apps/ai-chat-service/src/ai-chat-service.module';
import { FinanceServiceModule } from '../../apps/finance-service/src/finance-service.module';
import { AdminServiceModule } from '../../apps/admin-service/src/admin-service.module';
import { rows, type Row } from './authz-matrix.rows';
import {
    ACTOR_ROLES,
    createTestAuth,
    type Actor,
    type TestAuth,
} from './test-tokens';

/** Controllers of a service module, from its static metadata (no DI boot). */
function controllersOf(root: Type<unknown>): Type<unknown>[] {
    const seen = new Set<unknown>();
    const out = new Set<Type<unknown>>();
    const walk = (ref: unknown): void => {
        if (!ref || ref instanceof Promise) return;
        const dynamic = (ref as { module?: Type<unknown> }).module;
        const target = (dynamic ?? ref) as Type<unknown>;
        if (seen.has(target) && !dynamic) return;
        seen.add(target);
        const extra = dynamic
            ? (ref as { controllers?: Type<unknown>[]; imports?: unknown[] })
            : {};
        const meta = <T>(k: string) =>
            (Reflect.getMetadata(k, target) as T[] | undefined) ?? [];
        [
            ...meta<Type<unknown>>('controllers'),
            ...(extra.controllers ?? []),
        ].forEach((c) => out.add(c));
        [...meta<unknown>('imports'), ...(extra.imports ?? [])].forEach(walk);
    };
    walk(root);
    // only classes that have handlers (skips empty marker controllers)
    return [...out].filter(
        (c) => Object.getOwnPropertyNames(c.prototype).length > 1
    );
}

/** A stand-in for any service: every method resolves to `{}`; `then` stays undefined (not a thenable). */
const stub = (): object =>
    new Proxy(
        {},
        {
            get: (_t, prop) => (prop === 'then' ? undefined : async () => ({})),
        }
    );

/** Owner resolver stub: the test says who owns the resource through `x-test-owner`. */
@Injectable()
class HeaderOwnerResolver {
    async resolveOwnerId(req: {
        headers?: Record<string, string>;
    }): Promise<string | null> {
        return (req.headers?.['x-test-owner'] as string | undefined) ?? null;
    }
}

async function boot(
    auth: TestAuth,
    root: Type<unknown>,
    serviceName: string
): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
        imports: [
            AuthJwtModule.forRoot({
                serviceName,
                verifier: { useFactory: () => auth.verifier },
            }),
        ],
        controllers: controllersOf(root),
        providers: [
            {
                provide: FlashcardSetOwnerResolver,
                useClass: HeaderOwnerResolver,
            },
            {
                provide: QuizSetOwnerResolver,
                useClass: HeaderOwnerResolver,
            },
        ],
    })
        .useMocker(() => stub())
        .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
}

const matches = (status: number, want: number | '2xx' | 'gate') =>
    want === '2xx'
        ? status >= 200 && status < 300
        : want === 'gate'
          ? status !== 401 && status !== 403 && status < 500
          : status === want;

describe('authz matrix (real guards, stubbed services)', () => {
    let auth: TestAuth;
    const apps: Partial<Record<keyof typeof rows, INestApplication>> = {};
    const tokens = {} as Record<Actor, string>;

    beforeAll(async () => {
        auth = await createTestAuth();
        apps.content = await boot(auth, ContentServiceModule, 'content');
        apps.assessment = await boot(auth, AssessmentServiceModule, 'assessment');
        apps.studyroom = await boot(
            auth,
            StudyRoomServiceModule,
            'studyroom'
        );
        apps.vocabulary = await boot(
            auth,
            VocabularyServiceModule,
            'vocabulary'
        );
        apps.document = await boot(auth, DocumentServiceModule, 'document');
        apps.aichat = await boot(auth, AIChatServiceModule, 'ai-chat');
        apps.finance = await boot(auth, FinanceServiceModule, 'finance');
        apps.admin = await boot(auth, AdminServiceModule, 'admin');
        for (const actor of Object.keys(ACTOR_ROLES) as Actor[])
            tokens[actor] = await auth.token(actor);
    });
    afterAll(async () => {
        await Promise.all(Object.values(apps).map((a) => a?.close()));
    });

    for (const [service, serviceRows] of Object.entries(rows) as Array<[keyof typeof rows, Row[]]>) {
        describe(`${service}-service`, () => {
            it.each(
                serviceRows.flatMap((row) =>
                    (Object.keys(ACTOR_ROLES) as Actor[]).map(
                        (actor) => [row.name, actor, row] as const
                    )
                )
            )('%s as %s', async (_name, actor, row) => {
                let req = request(apps[service]!.getHttpServer())
                    [row.method](row.path)
                    .set('Authorization', `Bearer ${tokens[actor]}`);
                if (row.ownedByCaller)
                    req = req.set(
                        'x-test-owner',
                        `user-${actor.toLowerCase()}`
                    );
                const res = row.body ? await req.send(row.body) : await req;
                expect({
                    status: res.status,
                    ok: matches(res.status, row.expect[actor]),
                }).toEqual({ status: res.status, ok: true });
            });

            it.each(
                serviceRows
                    .filter((r) => !r.name.includes('(public)'))
                    .map((r) => [r.name, r] as const)
            )('%s as anonymous -> 401', async (_name, row) => {
                const req = request(apps[service]!.getHttpServer())[row.method](
                    row.path
                );
                const res = row.body ? await req.send(row.body) : await req;
                expect(res.status).toBe(401);
            });
        });
    }
});
