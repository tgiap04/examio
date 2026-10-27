import { join } from 'path';
import { Test, type TestingModule } from '@nestjs/testing';
import { ServiceTokenClient } from '@examio/auth-jwt';
import { createTestKeyPair, serviceClaims, signTestToken } from '@examio/auth-jwt/testing';
import { createEnvelope } from '@examio/messaging';
import { PrismaService } from '../src/prisma';
import { eventually } from './ownership/support/broker';
import { rid } from './ownership/support/assessment-test-app';

/**
 * The worker role of assessment boots against real Postgres and RabbitMQ with the broker user `assessment`
 * and relays its outbox: a row of source `assessment` is published (the user may write `assessment.*` only)
 * and marked published.
 */
describe('assessment worker role (e2e)', () => {
    let worker: TestingModule;
    const originalCwd = process.cwd();

    beforeAll(async () => {
        process.chdir(join(__dirname, '..', '..', '..'));
        const keys = await createTestKeyPair('worker-kid');
        const { WorkerModule } = await import('../src/worker.module');
        worker = await Test.createTestingModule({ imports: [WorkerModule] })
            .overrideProvider(ServiceTokenClient)
            .useValue({ getToken: (audience: string) => signTestToken(keys, { claims: serviceClaims('assessment'), audience }) })
            .compile();
        await worker.init();
    }, 60_000);

    afterAll(async () => {
        await worker?.close();
        process.chdir(originalCwd);
    });

    it('relays an outbox row of source assessment and marks it published', async () => {
        const prisma = worker.get(PrismaService);
        const envelope = createEnvelope('assessment.probe.checked', { probe: rid() }, { source: 'assessment' });
        await prisma.outboxEvent.create({
            data: { id: envelope.id, source: 'assessment', type: envelope.type, envelope: envelope as never },
        });
        const row = await eventually(async () => {
            const found = await prisma.outboxEvent.findUnique({ where: { id: envelope.id } });
            return found?.publishedAt ? found : null;
        });
        expect(row.source).toBe('assessment');
        expect(row.attempts).toBeLessThanOrEqual(1);
    });
});
