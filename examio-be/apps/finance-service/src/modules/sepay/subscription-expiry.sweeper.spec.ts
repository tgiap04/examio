import { SubscriptionExpirySweeper, resolveSweepIntervalMs, DEFAULT_EXPIRY_SWEEP_MS } from './subscription-expiry.sweeper';
import type { SubscriptionExpiryService } from './subscription-expiry.service';

describe('resolveSweepIntervalMs', () => {
    it.each([
        [undefined, DEFAULT_EXPIRY_SWEEP_MS],
        ['', DEFAULT_EXPIRY_SWEEP_MS],
        ['abc', DEFAULT_EXPIRY_SWEEP_MS],
        ['0', DEFAULT_EXPIRY_SWEEP_MS],
        ['-5', DEFAULT_EXPIRY_SWEEP_MS],
        ['1.5', DEFAULT_EXPIRY_SWEEP_MS],
        ['5000', 5000],
    ])('%p -> %p', (raw, expected) => {
        expect(resolveSweepIntervalMs(raw)).toBe(expected);
    });
});

describe('SubscriptionExpirySweeper.tick', () => {
    it('never throws and keeps going when one row fails', async () => {
        const expiry = {
            findLapsedUserIds: jest.fn().mockResolvedValue(['a', 'b']),
            expireIfLapsed: jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(true),
        };
        const sweeper = new SubscriptionExpirySweeper(expiry as unknown as SubscriptionExpiryService);
        await expect(sweeper.tick()).resolves.toBe(1);
        expect(expiry.expireIfLapsed).toHaveBeenCalledTimes(2);
    });

    it('swallows a failing lookup', async () => {
        const expiry = { findLapsedUserIds: jest.fn().mockRejectedValue(new Error('db down')), expireIfLapsed: jest.fn() };
        const sweeper = new SubscriptionExpirySweeper(expiry as unknown as SubscriptionExpiryService);
        await expect(sweeper.tick()).resolves.toBe(0);
    });
});
