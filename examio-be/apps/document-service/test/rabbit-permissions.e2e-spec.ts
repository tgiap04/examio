import * as amqp from 'amqplib';
import { EVENTS_EXCHANGE, declareTopology } from '@examio/messaging';

/**
 * The broker users of the `document` and `ai` services against a REAL RabbitMQ started from the
 * rendered `deploy/rabbitmq/definitions.template.json` (the same file production uses):
 *   RABBITMQ_URL     amqp://document:<RABBITMQ_DOCUMENT_PASS>@host
 *   RABBITMQ_AI_URL  amqp://ai:<RABBITMQ_AI_PASS>@host
 * Under CI=true a missing URL FAILS the suite instead of skipping it.
 */
const documentUrl = process.env.RABBITMQ_URL;
const aiUrl = process.env.RABBITMQ_AI_URL;
const enabled = Boolean(documentUrl && aiUrl);
const describeBroker = enabled
    ? describe
    : process.env.CI === 'true'
      ? (name: string) =>
            describe(name, () => {
                it('requires RABBITMQ_URL and RABBITMQ_AI_URL in CI (refusing to skip)', () => {
                    throw new Error('RABBITMQ_URL / RABBITMQ_AI_URL must be set when CI=true');
                });
            })
      : describe.skip;

/** Runs `action` on a fresh channel and resolves the broker's `ACCESS_REFUSED` text, or `null` if it was accepted. */
async function refusal(
    url: string,
    action: (ch: amqp.ConfirmChannel) => Promise<unknown> | unknown,
    settleMs = 600
): Promise<string | null> {
    const connection = await amqp.connect(url);
    // A refused operation closes the channel (and only the channel) with a 403.
    connection.on('error', () => undefined);
    try {
        const ch = await connection.createConfirmChannel();
        const closed = new Promise<string>((resolve) => ch.once('error', (err: Error) => resolve(err.message)));
        await Promise.resolve(action(ch)).catch(() => undefined);
        return await Promise.race([
            closed,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), settleMs)),
        ]);
    } finally {
        await connection.close().catch(() => undefined);
    }
}

const publish = (key: string) => (ch: amqp.ConfirmChannel) =>
    ch.publish(EVENTS_EXCHANGE, key, Buffer.from('{}'), { persistent: true });

describeBroker('RabbitMQ permissions of the document and ai users (e2e)', () => {
    beforeAll(async () => {
        // Both services declare their own topology the way libs/messaging does.
        for (const [url, svc] of [
            [documentUrl as string, 'document'],
            [aiUrl as string, 'ai'],
        ] as const) {
            const connection = await amqp.connect(url);
            const ch = await connection.createChannel();
            await declareTopology(ch, svc);
            await connection.close();
        }
    });

    it('ai publishing document.uploaded is ACCESS_REFUSED (topic permission ^ai\\.)', async () => {
        const text = await refusal(aiUrl as string, publish('document.uploaded'));
        expect(text).toMatch(/ACCESS_REFUSED/);
        expect(text).toContain("'document.uploaded'");
    });

    it('document publishing ai.document.processed is ACCESS_REFUSED (topic permission ^document\\.)', async () => {
        expect(await refusal(documentUrl as string, publish('ai.document.processed'))).toMatch(/ACCESS_REFUSED/);
        expect(await refusal(documentUrl as string, publish('exam.anything'))).toMatch(/ACCESS_REFUSED/);
    });

    it('each side may publish its own keys', async () => {
        expect(await refusal(documentUrl as string, publish('document.uploaded'))).toBeNull();
        expect(await refusal(documentUrl as string, publish('document.deleted'))).toBeNull();
        expect(await refusal(aiUrl as string, publish('ai.document.processed'))).toBeNull();
        expect(await refusal(aiUrl as string, publish('ai.document.failed'))).toBeNull();
    });

    it('document reading ai.events is ACCESS_REFUSED, and so is ai reading document.events', async () => {
        const read = (queue: string) => (ch: amqp.ConfirmChannel) => ch.consume(queue, () => undefined);
        expect(await refusal(documentUrl as string, read('ai.events'))).toMatch(/ACCESS_REFUSED.*queue 'ai\.events'/);
        expect(await refusal(documentUrl as string, read('ai.retry.30s'))).toMatch(/ACCESS_REFUSED/);
        expect(await refusal(aiUrl as string, read('document.events'))).toMatch(/ACCESS_REFUSED.*queue 'document\.events'/);
    });

    it('document cannot declare or bind queues of other services; ai cannot declare document.* ones', async () => {
        expect(await refusal(documentUrl as string, (ch) => ch.assertQueue('ai.events', { durable: true }))).toMatch(/ACCESS_REFUSED/);
        expect(await refusal(documentUrl as string, (ch) => ch.assertQueue('exam.events', { durable: true }))).toMatch(/ACCESS_REFUSED/);
        expect(await refusal(aiUrl as string, (ch) => ch.assertQueue('document.dlq', { durable: true }))).toMatch(/ACCESS_REFUSED/);
        expect(await refusal(aiUrl as string, (ch) => ch.assertQueue('ai-service-queue', { durable: true }))).toMatch(/ACCESS_REFUSED/);
    });

    it('each side consumes its own queue and binds the keys it needs from the other', async () => {
        expect(await refusal(documentUrl as string, (ch) => ch.consume('document.events', () => undefined))).toBeNull();
        expect(await refusal(aiUrl as string, (ch) => ch.consume('ai.events', () => undefined))).toBeNull();
        for (const key of ['ai.document.processed', 'ai.document.failed']) {
            expect(await refusal(documentUrl as string, (ch) => ch.bindQueue('document.events', EVENTS_EXCHANGE, key))).toBeNull();
        }
        for (const key of ['document.uploaded', 'document.deleted', 'content.generation.requested']) {
            expect(await refusal(aiUrl as string, (ch) => ch.bindQueue('ai.events', EVENTS_EXCHANGE, key))).toBeNull();
        }
    });
});
