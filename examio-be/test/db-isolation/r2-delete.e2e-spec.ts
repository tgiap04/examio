import { Pool } from 'pg';
import { PrismaClient } from '../../apps/auth-service/src/generated/prisma/client';
import { createPrismaAdapter } from '../../apps/auth-service/src/prisma/create-prisma-adapter';
import { R2DeleteTaskWriter } from '../../libs/messaging/src/r2-delete/r2-delete-task.writer';
import { R2DeleteWorker } from '../../libs/messaging/src/r2-delete/r2-delete.worker';
import { toPgConnectionString } from '../../libs/messaging/src/relay-pool';
import { assertLocal, describeWhenEnabled, urlOf } from './db-env';

/** Durable R2 deletion against a real Postgres (auth role, schema auth). Skips without AUTH_DATABASE_URL. */
const url = urlOf('auth');
const describeDb = describeWhenEnabled(Boolean(url), 'AUTH_DATABASE_URL');

describeDb('r2_delete_tasks outbox + worker (real Postgres)', () => {
    const tag = `t${Date.now().toString(36)}`;
    const k = (n: string) => `${tag}/${n}`;
    let prisma: PrismaClient;
    let pool: Pool;
    const writer = new R2DeleteTaskWriter();

    const rowsFor = async () =>
        (await pool.query('SELECT key, attempts, last_error, next_attempt_at > now() AS deferred FROM r2_delete_tasks WHERE key LIKE $1 ORDER BY key', [`${tag}/%`])).rows;
    const makeWorker = (deleteObjects: jest.Mock) =>
        new R2DeleteWorker({ pollMs: 10, maxAttempts: 10 }, pool as never, { deleteObjects });

    beforeAll(async () => {
        assertLocal(url as string);
        prisma = new PrismaClient({ adapter: createPrismaAdapter(url) });
        pool = new Pool({ connectionString: toPgConnectionString(url as string), max: 4 });
    });
    afterEach(async () => {
        await pool.query('DELETE FROM r2_delete_tasks WHERE key LIKE $1', [`${tag}/%`]);
    });
    afterAll(async () => {
        await prisma.$disconnect();
        await pool.end();
    });

    it('enqueue commits with the tx and rolls back with it', async () => {
        await prisma.$transaction((tx) => writer.enqueue(tx, [k('keep')]));
        await expect(
            prisma.$transaction(async (tx) => {
                await writer.enqueue(tx, [k('rolled-back')]);
                throw new Error('business write failed');
            })
        ).rejects.toThrow('business write failed');
        expect((await rowsFor()).map((r) => r.key)).toEqual([k('keep')]);
    });

    it('sends DeleteObjects once for a due task and removes the row', async () => {
        await prisma.$transaction((tx) => writer.enqueue(tx, [k('a')]));
        const send = jest.fn().mockResolvedValue({ deletedCount: 1 });
        await makeWorker(send).tick();
        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith([k('a')]);
        expect(await rowsFor()).toEqual([]);
    });

    it('UNAVAILABLE: row stays with attempts=1 and a pushed next_attempt_at, then succeeds on retry', async () => {
        await prisma.$transaction((tx) => writer.enqueue(tx, [k('retry')]));
        const send = jest.fn().mockRejectedValueOnce(new Error('14 UNAVAILABLE')).mockResolvedValue({});
        const worker = makeWorker(send);
        await worker.tick();
        const [row] = await rowsFor();
        expect(row).toMatchObject({ attempts: 1, last_error: '14 UNAVAILABLE', deferred: true });
        await expect(worker.tick()).resolves.toBe(0); // not due yet
        await pool.query('UPDATE r2_delete_tasks SET next_attempt_at = now() WHERE key = $1', [k('retry')]);
        await worker.tick();
        expect(send).toHaveBeenCalledTimes(2);
        expect(await rowsFor()).toEqual([]);
    });

    it('a task at max attempts is kept and never retried', async () => {
        await prisma.$transaction((tx) => writer.enqueue(tx, [k('stuck')]));
        await pool.query('UPDATE r2_delete_tasks SET attempts = 10, next_attempt_at = now() WHERE key = $1', [k('stuck')]);
        const send = jest.fn();
        await expect(makeWorker(send).tick()).resolves.toBe(0);
        expect(send).not.toHaveBeenCalled();
        expect(await rowsFor()).toHaveLength(1);
    });

    it('two workers in parallel send each key exactly once', async () => {
        const keys = Array.from({ length: 150 }, (_, i) => k(`p${String(i).padStart(3, '0')}`));
        await prisma.$transaction((tx) => writer.enqueue(tx, keys));
        const sent: string[] = [];
        const send = jest.fn(async (batch: string[]) => {
            await new Promise((r) => setTimeout(r, 25));
            sent.push(...batch);
        });
        const [a, b] = [makeWorker(send), makeWorker(send)];
        const drain = async (w: R2DeleteWorker) => {
            while ((await w.tick()) > 0);
        };
        await Promise.all([drain(a), drain(b)]);
        expect(sent).toHaveLength(150);
        expect(new Set(sent).size).toBe(150);
        expect(await rowsFor()).toEqual([]);
    });

    it('a slow R2 call outliving its lease: the second worker re-claims once, the first worker neither deletes nor fails the re-claimed row', async () => {
        await prisma.$transaction((tx) => writer.enqueue(tx, [k('slow')]));
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const slow = jest.fn(async () => {
            await gate;
            throw new Error('late failure of the first worker');
        });
        const fast = jest.fn().mockResolvedValue({});
        // Worker A leases for 1 s and then hangs on R2 for longer than that.
        const a = new R2DeleteWorker({ pollMs: 10, maxAttempts: 10, leaseSeconds: 1 }, pool as never, { deleteObjects: slow });
        const b = new R2DeleteWorker({ pollMs: 10, maxAttempts: 10, leaseSeconds: 60 }, pool as never, { deleteObjects: fast });
        const first = a.tick();
        await new Promise((r) => setTimeout(r, 1300)); // A's lease has expired, A's R2 call is still in flight
        await expect(b.tick()).resolves.toBe(1); // B legitimately re-claims and (via its own lease) owns the row
        expect(fast).toHaveBeenCalledTimes(1);
        // B finished and removed the row; the late FAIL of A must find nothing to touch.
        release();
        await first;
        const rows = await rowsFor();
        expect(rows).toEqual([]); // A's late FAIL did not resurrect or bump anything
        expect(slow).toHaveBeenCalledTimes(1);
    });

    it('with the lease still valid nothing is re-sent while R2 is slow (no double-send)', async () => {
        await prisma.$transaction((tx) => writer.enqueue(tx, [k('inflight')]));
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const slow = jest.fn(async () => {
            await gate;
        });
        const other = jest.fn();
        const a = new R2DeleteWorker({ pollMs: 10, maxAttempts: 10, leaseSeconds: 60 }, pool as never, { deleteObjects: slow });
        const b = new R2DeleteWorker({ pollMs: 10, maxAttempts: 10, leaseSeconds: 60 }, pool as never, { deleteObjects: other });
        const first = a.tick();
        await new Promise((r) => setTimeout(r, 1300));
        await expect(b.tick()).resolves.toBe(0);
        expect(other).not.toHaveBeenCalled();
        release();
        await first;
        expect(slow).toHaveBeenCalledTimes(1);
        expect(await rowsFor()).toEqual([]);
    });

    it('a stale worker FAIL after its lease expired does not bump attempts on the row another worker now owns', async () => {
        await prisma.$transaction((tx) => writer.enqueue(tx, [k('foreign')]));
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const slow = jest.fn(async () => {
            await gate;
            throw new Error('stale');
        });
        let releaseB!: () => void;
        const gateB = new Promise<void>((r) => (releaseB = r));
        const slowB = jest.fn(async () => {
            await gateB;
        });
        const a = new R2DeleteWorker({ pollMs: 10, maxAttempts: 10, leaseSeconds: 1 }, pool as never, { deleteObjects: slow });
        const b = new R2DeleteWorker({ pollMs: 10, maxAttempts: 10, leaseSeconds: 60 }, pool as never, { deleteObjects: slowB });
        const firstA = a.tick();
        await new Promise((r) => setTimeout(r, 1300));
        const firstB = b.tick(); // B re-claims while A is still in flight
        await new Promise((r) => setTimeout(r, 200));
        release(); // A fails late
        await firstA;
        const [row] = await rowsFor();
        expect(row).toMatchObject({ attempts: 0, last_error: null }); // B's row untouched by A's FAIL
        releaseB();
        await firstB;
        expect(await rowsFor()).toEqual([]);
    });

    it('a poison key fails alone: the good key is deleted, the bad key backs off with attempts=1', async () => {
        await prisma.$transaction((tx) => writer.enqueue(tx, [k('good'), k('poison')]));
        const send = jest.fn().mockResolvedValue({ failedKeys: [k('poison')] });
        await makeWorker(send).tick();
        const rows = await rowsFor();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ key: k('poison'), attempts: 1, deferred: true });
    });
});
