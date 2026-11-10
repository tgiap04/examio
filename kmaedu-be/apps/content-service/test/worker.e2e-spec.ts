import { join } from 'path';
import { Test, type TestingModule } from '@nestjs/testing';
import { ServiceTokenClient } from '@kmaedu/auth-jwt';
import { createTestKeyPair, serviceClaims, signTestToken, type TestKeyPair } from '@kmaedu/auth-jwt/testing';
import { bootContentApp, rid, type ContentTestApp } from './ownership/support/content-test-app';
import { eventually } from './ownership/support/broker';
import { startFakeR2, type FakeR2 } from './ownership/support/fake-r2';
import { call } from './ownership/support/http';

const BASE = 'https://cdn.kmaedu.test';

/**
 * The real worker role of content (outbox relay + generation watchdog + r2_delete_tasks drain) against real
 * Postgres and RabbitMQ (it boots with no finance-service configured): a deleted set's thumbnail leaves
 * through r2 `DeleteObjects` exactly once, as the service token `svc:content`, and the
 * `content.quizset.deleted` outbox row is relayed and marked published.
 */
describe('content worker role (e2e)', () => {
    let t: ContentTestApp;
    let r2: FakeR2;
    let worker: TestingModule;
    let keys: TestKeyPair;
    const savedBase = process.env.R2_PUBLIC_URL;
    const originalCwd = process.cwd();

    beforeAll(async () => {
        process.env.R2_PUBLIC_URL = BASE;
        process.env.R2_DELETE_POLL_MS = '50';
        t = await bootContentApp();
        r2 = await startFakeR2();
        process.env.R2_GRPC_URL = r2.server.url;
        delete process.env.FINANCE_GRPC_URL; // nothing in content may need finance-service any more
        process.chdir(join(__dirname, '..', '..', '..'));
        keys = await createTestKeyPair('worker-kid');
        const { WorkerModule } = await import('../src/worker.module');
        worker = await Test.createTestingModule({ imports: [WorkerModule] })
            .overrideProvider(ServiceTokenClient)
            .useValue({ getToken: (audience: string) => signTestToken(keys, { claims: serviceClaims('content'), audience }) })
            .compile();
        await worker.init();
    }, 60_000);

    afterAll(async () => {
        await worker?.close();
        await r2?.close();
        await t?.close();
        delete process.env.R2_DELETE_POLL_MS;
        if (savedBase === undefined) delete process.env.R2_PUBLIC_URL;
        else process.env.R2_PUBLIC_URL = savedBase;
        process.chdir(originalCwd);
    });

    it('delete of a set with an R2 thumbnail: one task in the tx, then ONE DeleteObjects([key]) as svc:content, then the task is gone', async () => {
        const owner = await t.createUser(['TEACHER']);
        const key = `quizset-thumbnails/${owner.id}/${rid()}.png`;
        const id = `qs_${rid()}`;
        await t.prisma.quizSet.create({ data: { id, title: 't', userId: owner.id, thumbnail: `${BASE}/${key}` } });

        const res = await call(t.server, 'delete', `/quizsets/${id}`, await t.tokenFor(owner));
        expect(res.status).toBe(200);

        await eventually(async () => (await t.prisma.r2DeleteTask.count({ where: { key } })) === 0);
        const deletes = r2.calls.filter((c) => c.keys.includes(key));
        expect(deletes).toEqual([{ rpc: 'DeleteObjects', keys: [key], caller: 'svc:content' }]);
    });

    it('the outbox relay of the worker publishes content.quizset.deleted and marks the row published', async () => {
        const owner = await t.createUser(['TEACHER']);
        const id = `qs_${rid()}`;
        await t.prisma.quizSet.create({ data: { id, title: 't', userId: owner.id } });
        await call(t.server, 'delete', `/quizsets/${id}`, await t.tokenFor(owner));

        const row = await eventually(async () => {
            const rows = await t.prisma.outboxEvent.findMany({ where: { type: 'content.quizset.deleted' } });
            const mine = rows.find((r) => (r.envelope as { data: { quizSetIds: string[] } }).data.quizSetIds.includes(id));
            return mine?.publishedAt ? mine : null;
        });
        expect(row.source).toBe('content');
    });
});
