import * as amqp from 'amqplib';
import { lastValueFrom } from 'rxjs';
import { Test, type TestingModule } from '@nestjs/testing';
import { ServiceTokenClient } from '@examio/auth-jwt';
import { EVENTS_EXCHANGE, createEnvelope, declareTopology, type Envelope } from '@examio/messaging';
import { bootDocumentApp, rid, type DocumentTestApp, type TestUser } from './support/document-test-app';
import { call, outboxFor, queuedKeys, registerBody } from './support/helpers';

/**
 * The real WorkerModule (outbox relay, document.events consumer, r2_delete_tasks worker) against a
 * REAL RabbitMQ started from the rendered definitions, and real Postgres:
 *   RABBITMQ_URL     amqp://document:<pass>@host   (the worker's own broker user)
 *   RABBITMQ_AI_URL  amqp://ai:<pass>@host         (publishes ai.* events, consumes document.*)
 * ai-service is played by the `ai` broker user.
 */
const enabled = Boolean(process.env.RABBITMQ_URL && process.env.RABBITMQ_AI_URL);
const describeWorker = enabled
    ? describe
    : process.env.CI === 'true'
      ? (name: string) =>
            describe(name, () => {
                it('requires RABBITMQ_URL and RABBITMQ_AI_URL in CI (refusing to skip)', () => {
                    throw new Error('RABBITMQ_URL / RABBITMQ_AI_URL must be set when CI=true');
                });
            })
      : describe.skip;

async function until<T>(read: () => Promise<T | undefined | false | null>, what: string, ms = 20_000): Promise<T> {
    const deadline = Date.now() + ms;
    for (;;) {
        const value = await read();
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}

describeWorker('document worker pipeline (e2e)', () => {
    let t: DocumentTestApp;
    let worker: TestingModule;
    let aiConnection: amqp.ChannelModel;
    let aiPublisher: amqp.ConfirmChannel;
    let documentConnection: amqp.ChannelModel;
    const seenByAi: Envelope[] = [];

    const publishAsAi = async (type: string, data: object, source = 'ai', envelope?: Envelope) => {
        const e = envelope ?? createEnvelope(type, data, { source: 'ai' });
        const body = envelope ? e : { ...e, source };
        aiPublisher.publish(EVENTS_EXCHANGE, type, Buffer.from(JSON.stringify(body)), {
            persistent: true,
            messageId: e.id,
            contentType: 'application/json',
        });
        await aiPublisher.waitForConfirms();
        return e;
    };
    const dlqCount = async () => {
        const ch = await documentConnection.createChannel();
        try {
            return (await ch.checkQueue('document.dlq')).messageCount;
        } finally {
            await ch.close().catch(() => undefined);
        }
    };
    const rowOf = (id: string) => t.prisma.userStorage.findUniqueOrThrow({ where: { id } });
    const registeredDoc = async (user: TestUser) => {
        const res = await call(t.server, 'post', '/ai/upload', await t.tokenFor(user), registerBody(user));
        expect(res.status).toBe(201);
        return res.body.id as string;
    };

    beforeAll(async () => {
        t = await bootDocumentApp();
        process.env.R2_DELETE_POLL_MS = '50';
        // ai-service's side of the broker: its own topology, bound to what it consumes.
        aiConnection = await amqp.connect(process.env.RABBITMQ_AI_URL as string);
        const setup = await aiConnection.createChannel();
        await declareTopology(setup, 'ai');
        for (const key of ['document.uploaded', 'document.deleted']) await setup.bindQueue('ai.events', EVENTS_EXCHANGE, key);
        await setup.purgeQueue('ai.events');
        await setup.consume('ai.events', (msg) => {
            if (!msg) return;
            seenByAi.push(JSON.parse(msg.content.toString()) as Envelope);
            setup.ack(msg);
        });
        aiPublisher = await aiConnection.createConfirmChannel();
        documentConnection = await amqp.connect(process.env.RABBITMQ_URL as string);

        const { WorkerModule } = await import('../src/worker.module');
        worker = await Test.createTestingModule({ imports: [WorkerModule] })
            .overrideProvider(ServiceTokenClient)
            .useValue({ getToken: (audience: string) => t.serviceToken('document', audience) })
            .compile();
        await worker.init();
    }, 60_000);

    afterAll(async () => {
        await worker?.close();
        await aiConnection?.close().catch(() => undefined);
        await documentConnection?.close().catch(() => undefined);
        await t?.close();
    });

    it('the outbox relay publishes document.uploaded and document.deleted; ai-service binds and receives them', async () => {
        const user = t.teacher();
        const id = await registeredDoc(user);
        const uploaded = await until(
            async () => seenByAi.find((e) => e.type === 'document.uploaded' && (e.data as { storageId: string }).storageId === id),
            'document.uploaded at ai'
        );
        expect(uploaded).toMatchObject({
            source: 'document',
            version: 1,
            data: { storageId: id, userId: user.id, mimetype: 'application/pdf' },
        });
        expect((uploaded.data as { downloadUrl: string }).downloadUrl).toMatch(/^https:\/\/r2\.test\/signed\//);
        await until(async () => (await outboxFor(t.prisma, 'document.uploaded', id))[0]?.publishedAt, 'outbox row marked published');

        await call(t.server, 'delete', `/ai/upload/${id}`, await t.tokenFor(user));
        const deleted = await until(
            async () => seenByAi.find((e) => e.type === 'document.deleted' && JSON.stringify(e.data).includes(id)),
            'document.deleted at ai'
        );
        expect(deleted).toMatchObject({ source: 'document', data: { storageIds: [id], userId: user.id } });
    });

    it('the r2 delete worker removes the queued key through r2 DeleteObjects as svc:document', async () => {
        const user = t.teacher();
        const res = await call(t.server, 'post', '/ai/quick-upload', await t.tokenFor(user)).attach('file', Buffer.alloc(64), {
            filename: `w-${rid()}.pdf`,
            contentType: 'application/pdf',
        });
        const key = (await rowOf(res.body.userStorageId)).keyR2;
        await call(t.server, 'delete', `/ai/upload/${res.body.userStorageId}`, await t.tokenFor(user));
        expect(await queuedKeys(t.prisma, [key])).toEqual([key]);

        await until(async () => (await queuedKeys(t.prisma, [key])).length === 0, 'the task to be drained');
        expect(t.r2.calls.filter((c) => c.rpc === 'DeleteObjects' && c.keys.includes(key))).toEqual([
            expect.objectContaining({ caller: 'svc:document' }),
        ]);
    });

    it('ai.document.processed makes the row COMPLETED with its page count', async () => {
        const user = t.teacher();
        const id = await registeredDoc(user);
        await publishAsAi('ai.document.processed', { storageId: id, pageCount: 12 });
        await until(async () => (await rowOf(id)).processingStatus === 'COMPLETED', 'COMPLETED');
        expect(await rowOf(id)).toMatchObject({ processingStatus: 'COMPLETED', pageCount: 12 });
    });

    it('ai.document.failed only makes the row FAILED, and a replayed or repeated event changes nothing', async () => {
        const user = t.teacher();
        const id = await registeredDoc(user);

        const failed = await publishAsAi('ai.document.failed', { storageId: id, reason: 'OCR crashed' });
        await until(async () => (await rowOf(id)).processingStatus === 'FAILED', 'FAILED');

        // the broker redelivers the same envelope (same event id): dropped by processed_events
        await publishAsAi('ai.document.failed', { storageId: id, reason: 'OCR crashed' }, 'ai', failed);
        const second = await publishAsAi('ai.document.failed', { storageId: id, reason: 'again' });
        await until(async () => (await t.prisma.processedEvent.count({ where: { eventId: second.id } })) === 1, 'the second event');
        expect(await t.prisma.processedEvent.count({ where: { eventId: failed.id } })).toBe(1);
        expect(await rowOf(id)).toMatchObject({ processingStatus: 'FAILED' });
    });

    it('a FAILED document that EnsureProcessed re-queues can then complete; a late failure does not undo COMPLETED', async () => {
        const user = t.teacher();
        const id = await registeredDoc(user);
        await publishAsAi('ai.document.failed', { storageId: id, reason: 'OCR crashed' });
        await until(async () => (await rowOf(id)).processingStatus === 'FAILED', 'FAILED');

        const retried = await lastValueFrom(t.grpc.ensureProcessed({ id }, await t.md(user)));
        expect(retried.document?.id).toBe(id);
        await publishAsAi('ai.document.processed', { storageId: id, pageCount: 3 });
        await until(async () => (await rowOf(id)).processingStatus === 'COMPLETED', 'COMPLETED');

        const late = await publishAsAi('ai.document.failed', { storageId: id, reason: 'late' });
        await until(async () => (await t.prisma.processedEvent.count({ where: { eventId: late.id } })) === 1, 'the late event');
        expect(await rowOf(id)).toMatchObject({ processingStatus: 'COMPLETED', pageCount: 3 });
    });

    it('ai.document.failed for a quick-upload row makes it FAILED', async () => {
        const user = t.teacher();
        const res = await call(t.server, 'post', '/ai/quick-upload', await t.tokenFor(user)).attach('file', Buffer.alloc(64), {
            filename: `u-${rid()}.pdf`,
            contentType: 'application/pdf',
        });
        const id = res.body.userStorageId as string;
        await publishAsAi('ai.document.failed', { storageId: id, reason: 'x' });
        await until(async () => (await rowOf(id)).processingStatus === 'FAILED', 'FAILED');
    });

    it('an unknown document is ignored; a forged source or a malformed payload is dead-lettered with no effect', async () => {
        const user = t.teacher();
        const id = await registeredDoc(user);
        const dlqBefore = await dlqCount();

        await publishAsAi('ai.document.processed', { storageId: `gone_${rid()}`, pageCount: 1 }); // acked, nothing to update
        await publishAsAi('ai.document.failed', { storageId: id, reason: 'forged' }, 'document'); // source != routing-key domain
        await publishAsAi('ai.document.failed', { reason: 'no storageId' }); // invalid payload

        await until(async () => (await dlqCount()) >= dlqBefore + 2, 'two dead letters');
        expect(await rowOf(id)).toMatchObject({ processingStatus: 'PENDING' });
    });
});
