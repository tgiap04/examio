import { OutboxRelayService } from './outbox-relay.service';

type Row = { seq: string; envelope: Record<string, unknown>; attempts: number };

function row(seq: number): Row {
    return {
        seq: String(seq),
        attempts: 0,
        envelope: { id: `evt_${seq}`, type: 'auth.user.registered', source: 'auth' },
    };
}

function build(rows: Row[], publish: jest.Mock, connected = true) {
    const calls: string[] = [];
    const sqls: { sql: string; params: unknown[] }[] = [];
    const pool = {
        query: jest.fn(async (sql: string, params: unknown[] = []) => {
            sqls.push({ sql, params });
            if (/SET locked_until = \(now\(\) AT TIME ZONE 'UTC'\) \+/.test(sql)) {
                calls.push('claim-committed');
                return { rows, rowCount: rows.length };
            }
            calls.push('mark');
            return { rows: [], rowCount: 1 };
        }),
    };
    const wrapped = jest.fn(async (...args: unknown[]) => {
        calls.push('publish');
        return publish(...args);
    });
    const amqp = {
        isConnected: () => connected,
        publisher: { publish: wrapped },
    };
    const svc = new OutboxRelayService({ service: 'auth' }, pool as never, amqp as never);
    return { svc, calls, sqls, pool, wrapped };
}

describe('OutboxRelayService.tick', () => {
    it('commits the claim before the first publish and marks confirmed rows', async () => {
        const { svc, calls, sqls } = build(
            [row(1), row(2)],
            jest.fn().mockResolvedValue(true)
        );

        const n = await svc.tick();

        expect(n).toBe(2);
        expect(calls.indexOf('claim-committed')).toBe(0);
        expect(calls.indexOf('publish')).toBeGreaterThan(
            calls.indexOf('claim-committed')
        );
        expect(calls[calls.length - 1]).toBe('mark');
        const claim = sqls[0];
        expect(claim.params).toEqual([['auth']]);
        expect(claim.sql).toMatch(/FOR UPDATE SKIP LOCKED/);
        const mark = sqls.find((s) => /published_at = \(now\(\) AT TIME ZONE 'UTC'\)/.test(s.sql))!;
        expect(mark.sql).toMatch(/locked_until = NULL/);
        expect(mark.params[0]).toEqual(['1', '2']);
    });

    it('publishes to examio.events with routing key, messageId and persistence', async () => {
        const { svc, wrapped } = build([row(7)], jest.fn().mockResolvedValue(true));

        await svc.tick();

        const [exchange, key, content, options] = wrapped.mock.calls[0] as [
            string,
            string,
            Buffer,
            Record<string, unknown>,
        ];
        expect(exchange).toBe('examio.events');
        expect(key).toBe('auth.user.registered');
        expect(JSON.parse(content.toString()).id).toBe('evt_7');
        expect(options).toMatchObject({
            persistent: true,
            messageId: 'evt_7',
            contentType: 'application/json',
        });
        expect(options.headers).toBeUndefined();
    });

    it('on partial failure marks only fulfilled rows and backs off failed ones', async () => {
        const publish = jest
            .fn()
            .mockResolvedValueOnce(true)
            .mockRejectedValueOnce(new Error('nacked by broker'));
        const { svc, sqls } = build([row(1), row(2)], publish);

        await svc.tick();

        const ok = sqls.find((s) => /published_at = \(now\(\) AT TIME ZONE 'UTC'\)/.test(s.sql))!;
        expect(ok.params[0]).toEqual(['1']);
        const failed = sqls.find((s) => /attempts = o\.attempts \+ 1/.test(s.sql))!;
        expect(failed.sql).toMatch(/locked_until = NULL/);
        expect(failed.sql).toMatch(/LEAST\(power\(2, o\.attempts\), 300\)/);
        expect(failed.params[0]).toEqual(['2']);
        expect(failed.params[1]).toEqual([expect.stringContaining('nacked by broker')]);
    });

    it('does not claim while the broker connection is down', async () => {
        const { svc, pool } = build([row(1)], jest.fn(), false);

        expect(await svc.tick()).toBe(0);
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('returns 0 and publishes nothing when no rows are due', async () => {
        const { svc, wrapped, sqls } = build([], jest.fn());

        expect(await svc.tick()).toBe(0);
        expect(wrapped).not.toHaveBeenCalled();
        expect(sqls).toHaveLength(1);
    });
});

describe('OutboxRelayService stale alert and loop', () => {
    const { Logger } = jest.requireActual('@nestjs/common');

    it('logs an error when rows stay unpublished for more than 5 minutes', async () => {
        const err = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const pool = { query: jest.fn().mockResolvedValue({ rows: [{ n: 3 }], rowCount: 1 }) };
        const svc = new OutboxRelayService({ service: 'auth' }, pool as never, { isConnected: () => true } as never);

        await (svc as any).checkStale();

        expect(pool.query.mock.calls[0][0]).toMatch(/interval '5 minutes'/);
        expect(pool.query.mock.calls[0][1]).toEqual([['auth']]);
        expect(err).toHaveBeenCalledWith(expect.stringContaining('3 event(s) unpublished'));
        err.mockRestore();
    });

    it('stays quiet when nothing is stale, and checks at most once a minute', async () => {
        const err = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const pool = { query: jest.fn().mockResolvedValue({ rows: [{ n: 0 }], rowCount: 1 }) };
        const svc = new OutboxRelayService({ service: 'auth' }, pool as never, { isConnected: () => true } as never);

        await (svc as any).checkStale();
        await (svc as any).checkStale();

        expect(pool.query).toHaveBeenCalledTimes(1);
        expect(err).not.toHaveBeenCalled();
        err.mockRestore();
    });

    it('survives a failing tick, keeps looping and stops on shutdown', async () => {
        const err = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const pool = { query: jest.fn().mockRejectedValue(new Error('pg down')) };
        const svc = new OutboxRelayService({ service: 'auth' }, pool as never, { isConnected: () => true } as never);

        svc.onApplicationBootstrap();
        await new Promise((r) => setTimeout(r, 50));
        await svc.beforeApplicationShutdown();

        expect(err).toHaveBeenCalledWith(expect.stringContaining('pg down'));
        const calls = pool.query.mock.calls.length;
        await new Promise((r) => setTimeout(r, 700));
        expect(pool.query.mock.calls.length).toBe(calls);
        err.mockRestore();
    });

    it('times a publish out instead of hanging the batch', async () => {
        jest.useFakeTimers();
        try {
            const { svc, sqls } = build([row(1)], jest.fn().mockReturnValue(new Promise(() => undefined)));
            const done = svc.tick();
            await jest.advanceTimersByTimeAsync(10_000);
            await done;
            const failed = sqls.find((s) => /attempts = o\.attempts \+ 1/.test(s.sql))!;
            expect(failed.params[1]).toEqual([expect.stringContaining('timed out')]);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('OutboxRelayService sources', () => {
    it('claims the rows of the service and of every domain it also publishes', async () => {
        const pool = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
        const svc = new OutboxRelayService(
            { service: 'exam', alsoPublishes: ['content'] },
            pool as never,
            { isConnected: () => true, publisher: { publish: jest.fn() } } as never
        );

        await svc.tick();

        expect(pool.query.mock.calls[0][0]).toMatch(/source = ANY\(\$1::text\[\]\)/);
        expect(pool.query.mock.calls[0][1]).toEqual([['exam', 'content']]);
    });
});
