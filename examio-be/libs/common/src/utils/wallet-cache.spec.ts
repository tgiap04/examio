import {
    invalidateWalletCaches,
    invalidateWalletCachesBestEffort,
    walletCacheTargets,
} from './wallet-cache';

describe('wallet cache targets', () => {
    it('cover the wallet, its item/list scopes, transactions, stats and payments', () => {
        const { keys, patterns } = walletCacheTargets('u1', 'w1');
        expect(keys).toEqual(
            expect.arrayContaining([
                'wallet:user:u1',
                'wallet:user:u1:transactions',
                'payment:stats:user:u1',
                'wallet_transaction:stats:w1',
                'wallet_transaction:usage_breakdown:w1',
            ])
        );
        expect(patterns).toEqual(
            expect.arrayContaining([
                'wallet:user:u1:*',
                'payment:user:u1:*',
                'wallet_transaction:wallet:w1:page:*',
            ])
        );
    });

    it('without a wallet id the per-wallet keys are skipped', () => {
        const { keys, patterns } = walletCacheTargets('u1');
        expect(keys.join()).not.toContain('wallet_transaction');
        expect(patterns.join()).not.toContain('wallet_transaction');
    });

    it('deletes every key and pattern', async () => {
        const del = jest.fn().mockResolvedValue(undefined);
        const delPattern = jest.fn().mockResolvedValue(undefined);
        await invalidateWalletCaches({ del, delPattern } as never, 'u1', 'w1');
        const t = walletCacheTargets('u1', 'w1');
        expect(del.mock.calls.map((c) => c[0]).sort()).toEqual(
            [...t.keys].sort()
        );
        expect(delPattern.mock.calls.map((c) => c[0]).sort()).toEqual(
            [...t.patterns].sort()
        );
    });

    it('best-effort variant swallows a Redis failure (logged, never thrown)', async () => {
        const boom = {
            del: jest.fn().mockRejectedValue(new Error('redis down')),
            delPattern: jest.fn().mockRejectedValue(new Error('redis down')),
        };
        await expect(
            invalidateWalletCachesBestEffort(boom as never, 'u1', 'w1')
        ).resolves.toBeUndefined();
        await expect(
            invalidateWalletCaches(boom as never, 'u1', 'w1')
        ).rejects.toThrow('redis down');
    });
});
