import { Metadata } from '@grpc/grpc-js';
import { AdminStatsService } from './admin-stats.service';
import { fillDateGaps } from './admin-stats.types';

const md = new Metadata();
md.set('authorization', 'Bearer admin-token');

describe('AdminStatsService (aggregates come from auth over gRPC)', () => {
    let service: AdminStatsService;
    let authUsers: { getUserStats: jest.Mock };
    let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock; delPattern: jest.Mock };

    const userStats = (over: Record<string, unknown> = {}) => ({
        totalUsers: '10', activeToday: '2', activeLast30d: '7',
        signupsSeries: [], trafficSeries: [], utmSources: [], ...over,
    });

    beforeEach(() => {
        authUsers = { getUserStats: jest.fn(async () => userStats()) };
        redis = {
            get: jest.fn(async () => null),
            set: jest.fn(async () => undefined),
            del: jest.fn(),
            delPattern: jest.fn(),
        };
        service = new AdminStatsService(redis as never, authUsers as never);
        jest.useFakeTimers({ now: new Date('2026-03-15T10:30:00.000Z'), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'clearImmediate', 'hrtime', 'performance', 'queueMicrotask'] });
    });
    afterEach(() => jest.useRealTimers());

    describe('getOverview', () => {
        it('returns the cached value and calls no owner', async () => {
            const cached = { totalUsers: 42, activeToday: 1, active30d: 5 };
            redis.get.mockResolvedValue(cached);
            expect(await service.getOverview(md)).toEqual(cached);
            expect(redis.get).toHaveBeenCalledWith('admin:stats:overview');
            expect(authUsers.getUserStats).not.toHaveBeenCalled();
        });

        it('on a miss calls auth ONCE with the admin token, maps and caches for 5 minutes', async () => {
            const overview = await service.getOverview(md);
            expect(overview).toEqual({ totalUsers: 10, activeToday: 2, active30d: 7 });
            expect(Object.keys(overview).sort()).toEqual(['active30d', 'activeToday', 'totalUsers']);
            expect(authUsers.getUserStats).toHaveBeenCalledTimes(1);
            expect(authUsers.getUserStats.mock.calls[0][1]).toBe(md);
            expect(redis.set).toHaveBeenCalledWith('admin:stats:overview', overview, 300);
        });

        it('an owner failure surfaces and nothing is cached', async () => {
            authUsers.getUserStats.mockRejectedValue(new Error('auth down'));
            await expect(service.getOverview(md)).rejects.toThrow('auth down');
            expect(redis.set).not.toHaveBeenCalled();
        });
    });

    describe('getSeries', () => {
        it('returns the cached series without any RPC', async () => {
            const cached = { name: 'signups', range: '7d', bucket: 'day', points: [] };
            redis.get.mockResolvedValue(cached);
            expect(await service.getSeries('signups', '7d', md)).toBe(cached);
            expect(redis.get).toHaveBeenCalledWith('admin:stats:series:signups:7d');
            expect(authUsers.getUserStats).not.toHaveBeenCalled();
        });

        it('signups: auth series for the window, gaps filled with zeros as UTC-midnight ISO dates, cached under its key', async () => {
            authUsers.getUserStats.mockResolvedValue(
                userStats({ signupsSeries: [{ date: '2026-03-09', value: '2' }, { date: '2026-03-15', value: '2' }] })
            );
            const res = await service.getSeries('signups', '7d', md);
            expect(authUsers.getUserStats).toHaveBeenCalledWith({ days: 7, includeUtmSources: false }, md);
            expect(res.points.map((p) => [p.date, p.value])).toEqual([
                ['2026-03-09T00:00:00.000Z', 2], ['2026-03-10T00:00:00.000Z', 0], ['2026-03-11T00:00:00.000Z', 0],
                ['2026-03-12T00:00:00.000Z', 0], ['2026-03-13T00:00:00.000Z', 0], ['2026-03-14T00:00:00.000Z', 0],
                ['2026-03-15T00:00:00.000Z', 2],
            ]);
            expect(res).toMatchObject({ name: 'signups', range: '7d', bucket: 'day' });
            expect(redis.set).toHaveBeenCalledWith('admin:stats:series:signups:7d', res, 300);
        });

        it('traffic uses the auth traffic series', async () => {
            authUsers.getUserStats.mockResolvedValue(userStats({ trafficSeries: [{ date: '2026-03-15', value: '4' }] }));
            const traffic = await service.getSeries('traffic', '7d', md);
            expect(traffic.points.at(-1)).toEqual({ date: '2026-03-15T00:00:00.000Z', value: 4 });
        });
    });

    describe('getSourceBreakdown', () => {
        it('returns the cached breakdown without any RPC', async () => {
            const cached = { range: 'all', rows: [{ source: 'direct', count: 5 }] };
            redis.get.mockResolvedValue(cached);
            expect(await service.getSourceBreakdown(md)).toBe(cached);
            expect(redis.get).toHaveBeenCalledWith('admin:stats:sources:all');
            expect(authUsers.getUserStats).not.toHaveBeenCalled();
        });

        it('all time: no utm window, counts become numbers, cached under :all', async () => {
            authUsers.getUserStats.mockResolvedValue(userStats({ utmSources: [{ source: 'google', count: '3' }, { source: 'direct', count: '1' }] }));
            const res = await service.getSourceBreakdown(md);
            expect(authUsers.getUserStats).toHaveBeenCalledWith({ days: 1, includeUtmSources: true, utmDays: undefined }, md);
            expect(res).toEqual({ range: 'all', rows: [{ source: 'google', count: 3 }, { source: 'direct', count: 1 }] });
            expect(redis.set).toHaveBeenCalledWith('admin:stats:sources:all', res, 300);
        });

        it('keys the cache by range and asks auth for that window', async () => {
            await service.getSourceBreakdown(md, '30d');
            expect(authUsers.getUserStats).toHaveBeenCalledWith({ days: 1, includeUtmSources: true, utmDays: 30 }, md);
            expect(redis.get).toHaveBeenCalledWith('admin:stats:sources:30d');
        });
    });

    describe('invalidate', () => {
        it('deletes overview key', async () => {
            redis.del.mockResolvedValue(undefined);
            await service.invalidateOverview();
            expect(redis.del).toHaveBeenCalledWith('admin:stats:overview');
        });

        it('purges all series keys via pattern', async () => {
            redis.delPattern.mockResolvedValue(undefined);
            await service.invalidateSeries();
            expect(redis.delPattern).toHaveBeenCalledWith(
                'admin:stats:series:*'
            );
        });
    });

    describe('fillDateGaps', () => {
        it('emits one entry per UTC day from start to end inclusive', () => {
            const start = new Date(Date.UTC(2026, 0, 1));
            const end = new Date(Date.UTC(2026, 0, 3));

            const points = fillDateGaps([], start, end);

            expect(points).toHaveLength(3);
            expect(points.every((p) => p.value === 0)).toBe(true);
        });

        it('sums duplicate bucket keys on the same day', () => {
            const start = new Date(Date.UTC(2026, 0, 1));
            const end = new Date(Date.UTC(2026, 0, 1));
            const sameDay = new Date(Date.UTC(2026, 0, 1, 12, 34));

            const points = fillDateGaps(
                [
                    { date: sameDay, value: 2 },
                    { date: sameDay, value: 3 },
                ],
                start,
                end
            );

            expect(points).toEqual([
                { date: start.toISOString(), value: 5 },
            ]);
        });
    });
});
