import { of, throwError } from 'rxjs';
import { Metadata } from '@grpc/grpc-js';
import { PageFlagsBootstrap } from './page-flags-bootstrap.service';

const FAST = { initialMs: 1, maxMs: 4, recheckMs: 5 };

const booted: PageFlagsBootstrap[] = [];
afterEach(async () => {
    await Promise.all(booted.splice(0).map((b) => b.onModuleDestroy()));
});

function setup(over: { hasPages?: boolean; pulls?: Array<unknown> } = {}) {
    const config = {
        hasPages: jest.fn(async () => over.hasPages ?? false),
        setPages: jest.fn(async () => undefined),
    };
    const pulls = [...(over.pulls ?? [{ flags: { 'study-room': false } }])];
    const admin = {
        getPageFlags: jest.fn(() => {
            const next = pulls.length > 1 ? pulls.shift() : pulls[0];
            return next instanceof Error ? throwError(() => next) : of(next);
        }),
    };
    const clientGrpc = { getService: jest.fn(() => admin) };
    const meta = { asService: jest.fn(async () => new Metadata()) };
    const boot = new PageFlagsBootstrap(config as never, FAST, clientGrpc as never, meta as never);
    booted.push(boot);
    return { boot, config, admin, meta };
}

describe('PageFlagsBootstrap (gateway pulls AdminService.GetPageFlags when its Redis copy is empty)', () => {
    it('empty Redis: pulls with a gateway-audience service token and stores the flags through ConfigService.setPages', async () => {
        const { boot, config, admin, meta } = setup();
        boot.onModuleInit();
        await boot.settled();
        expect(meta.asService).toHaveBeenCalledWith('admin');
        expect(admin.getPageFlags).toHaveBeenCalledTimes(1);
        expect(config.setPages).toHaveBeenCalledWith({ 'study-room': false });
    });

    it('a copy already in Redis is served as is: no pull at all', async () => {
        const { boot, config, admin } = setup({ hasPages: true });
        boot.onModuleInit();
        await boot.settled();
        expect(admin.getPageFlags).not.toHaveBeenCalled();
        expect(config.setPages).not.toHaveBeenCalled();
    });

    it('retries with backoff while admin is unavailable, then applies the flags once', async () => {
        const down = Object.assign(new Error('internal'), { code: 13 }); // not retried inside invokeRpc: the loop is under test
        const { boot, config, admin } = setup({ pulls: [down, down, { flags: { a: true } }] });
        boot.onModuleInit();
        await boot.settled();
        expect(admin.getPageFlags).toHaveBeenCalledTimes(3);
        expect(config.setPages).toHaveBeenCalledTimes(1);
        expect(config.setPages).toHaveBeenCalledWith({ a: true });
    });

    it('stops retrying when admin pushed the flags (SetPageFlags) in the meantime', async () => {
        const down = Object.assign(new Error('internal'), { code: 13 }); // not retried inside invokeRpc: the loop is under test
        const { boot, config, admin } = setup({ pulls: [down] });
        // The key appears after the first failed attempt.
        config.hasPages.mockResolvedValueOnce(false).mockResolvedValue(true);
        boot.onModuleInit();
        await boot.settled();
        expect(admin.getPageFlags).toHaveBeenCalledTimes(1);
        expect(config.setPages).not.toHaveBeenCalled();
    });

    it('stops on shutdown instead of retrying forever', async () => {
        const down = Object.assign(new Error('internal'), { code: 13 }); // not retried inside invokeRpc: the loop is under test
        const { boot, admin } = setup({ pulls: [down] });
        boot.onModuleInit();
        await new Promise((r) => setTimeout(r, 20));
        await boot.onModuleDestroy();
        const calls = admin.getPageFlags.mock.calls.length;
        await new Promise((r) => setTimeout(r, 20));
        expect(admin.getPageFlags.mock.calls.length).toBe(calls);
    });

    it('a Redis error while checking for the copy retries instead of aborting the pull for good', async () => {
        const { boot, config, admin } = setup();
        config.hasPages.mockRejectedValueOnce(new Error('redis down')).mockResolvedValue(false);
        boot.onModuleInit();
        await boot.settled();
        expect(admin.getPageFlags).toHaveBeenCalledTimes(1);
        expect(config.setPages).toHaveBeenCalledWith({ 'study-room': false });
    });

    it('re-pulls later when the key is found missing again (Redis flushed while the gateway runs)', async () => {
        const { boot, config, admin } = setup();
        config.hasPages.mockResolvedValueOnce(true).mockResolvedValue(false);
        boot.onModuleInit();
        await boot.settled();
        expect(admin.getPageFlags).not.toHaveBeenCalled();
        await new Promise((r) => setTimeout(r, 40));
        expect(admin.getPageFlags).toHaveBeenCalled();
        expect(config.setPages).toHaveBeenCalledWith({ 'study-room': false });
    });

    it('is inert without a configured admin client or service token (not a startup failure)', async () => {
        const config = { hasPages: jest.fn(async () => false), setPages: jest.fn() };
        const boot = new PageFlagsBootstrap(config as never, FAST, undefined, undefined);
        booted.push(boot);
        boot.onModuleInit();
        await expect(boot.settled()).resolves.toBeUndefined();
        expect(config.setPages).not.toHaveBeenCalled();
    });
});
