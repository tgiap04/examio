import { normalizeR2Keys, R2DeleteTaskWriter } from './r2-delete-task.writer';

function fakeTx() {
    const calls: { sql: string; values: unknown[] }[] = [];
    return {
        calls,
        tx: {
            $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
                calls.push({ sql: strings.join('?'), values });
                return values.length;
            }),
        },
    };
}

describe('R2DeleteTaskWriter', () => {
    it('inserts the distinct, trimmed keys through the caller tx in one statement', async () => {
        const { tx, calls } = fakeTx();
        const n = await new R2DeleteTaskWriter().enqueue(tx, ['a/1.png', ' a/1.png ', null, undefined, '', 'b/2.png']);
        expect(n).toBe(2);
        expect(calls).toHaveLength(1);
        expect(calls[0].sql).toContain('INSERT INTO r2_delete_tasks');
        expect(calls[0].values).toEqual([['a/1.png', 'b/2.png']]);
    });

    it('does not touch the tx when there is nothing to delete', async () => {
        const { tx } = fakeTx();
        await expect(new R2DeleteTaskWriter().enqueue(tx, [null, '  '])).resolves.toBe(0);
        expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('propagates a tx failure so the caller rolls back', async () => {
        const tx = { $executeRaw: jest.fn().mockRejectedValue(new Error('tx aborted')) };
        await expect(new R2DeleteTaskWriter().enqueue(tx, ['k'])).rejects.toThrow('tx aborted');
    });

    it('normalizeR2Keys keeps first-seen order', () => {
        expect(normalizeR2Keys(['b', 'a', 'b'])).toEqual(['b', 'a']);
    });
});
