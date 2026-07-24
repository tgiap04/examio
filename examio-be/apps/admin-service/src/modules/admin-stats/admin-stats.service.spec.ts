import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@examio/database';
import { RedisService } from '@examio/redis';

import { AdminStatsService } from './admin-stats.service';
import { fillDateGaps } from './admin-stats.types';

describe('AdminStatsService', () => {
    let service: AdminStatsService;
    let prisma: {
        user: { count: jest.Mock };
        userSession: { count: jest.Mock };
        userSubscription: { count: jest.Mock };
        payment: { aggregate: jest.Mock };
        $queryRaw: jest.Mock;
    };
    let redis: {
        get: jest.Mock;
        set: jest.Mock;
        del: jest.Mock;
        delPattern: jest.Mock;
    };

    beforeEach(async () => {
        prisma = {
            user: { count: jest.fn() },
            userSession: { count: jest.fn() },
            userSubscription: { count: jest.fn() },
            payment: { aggregate: jest.fn() },
            $queryRaw: jest.fn(),
        };
        redis = {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            delPattern: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AdminStatsService,
                { provide: PrismaService, useValue: prisma },
                { provide: RedisService, useValue: redis },
            ],
        }).compile();

        service = module.get<AdminStatsService>(AdminStatsService);
    });

    describe('getOverview', () => {
        it('returns cached value when present and skips the database', async () => {
            const cached = {
                totalUsers: 42,
                activeToday: 1,
                active30d: 5,
                proCount: 2,
                vipCount: 1,
                revenue30d: 999,
            };
            redis.get.mockResolvedValue(cached);

            const result = await service.getOverview();

            expect(result).toEqual(cached);
            expect(prisma.user.count).not.toHaveBeenCalled();
            expect(redis.set).not.toHaveBeenCalled();
        });

        it('aggregates from Prisma + caches on cache miss', async () => {
            redis.get.mockResolvedValue(null);
            prisma.user.count.mockResolvedValue(10);
            prisma.userSession.count
                .mockResolvedValueOnce(3) // activeToday
                .mockResolvedValueOnce(7); // active30d
            prisma.userSubscription.count
                .mockResolvedValueOnce(4) // pro
                .mockResolvedValueOnce(1); // vip
            prisma.payment.aggregate.mockResolvedValue({
                _sum: { amount: 1234.5 },
            });

            const result = await service.getOverview();

            expect(result).toEqual({
                totalUsers: 10,
                activeToday: 3,
                active30d: 7,
                proCount: 4,
                vipCount: 1,
                revenue30d: 1234.5,
            });
            expect(redis.set).toHaveBeenCalledWith(
                'admin:stats:overview',
                result,
                300
            );
        });

        it('treats null sum as 0', async () => {
            redis.get.mockResolvedValue(null);
            prisma.user.count.mockResolvedValue(0);
            prisma.userSession.count.mockResolvedValue(0);
            prisma.userSubscription.count.mockResolvedValue(0);
            prisma.payment.aggregate.mockResolvedValue({
                _sum: { amount: null },
            });

            const result = await service.getOverview();

            expect(result.revenue30d).toBe(0);
        });
    });

    describe('getSeries', () => {
        it('returns cached series when present', async () => {
            const cached = {
                name: 'signups' as const,
                range: '7d' as const,
                bucket: 'day' as const,
                points: [],
            };
            redis.get.mockResolvedValue(cached);

            const result = await service.getSeries('signups', '7d');

            expect(result).toEqual(cached);
            expect(prisma.$queryRaw).not.toHaveBeenCalled();
        });

        it('queries raw SQL and caches the filled series', async () => {
            redis.get.mockResolvedValue(null);
            const today = new Date();
            const yesterday = new Date(
                Date.UTC(
                    today.getUTCFullYear(),
                    today.getUTCMonth(),
                    today.getUTCDate() - 1
                )
            );
            prisma.$queryRaw.mockResolvedValue([
                { date: yesterday, value: BigInt(5) },
            ]);

            const result = await service.getSeries('signups', '7d');

            expect(prisma.$queryRaw).toHaveBeenCalled();
            expect(result.points).toHaveLength(7);
            expect(result.points[6].value).toBe(5);
            expect(
                result.points
                    .slice(0, 6)
                    .every((p) => p.value === 0)
            ).toBe(true);
            expect(redis.set).toHaveBeenCalledWith(
                'admin:stats:series:signups:7d',
                result,
                300
            );
        });
    });

    describe('getSourceBreakdown', () => {
        it('returns cached breakdown and skips the database', async () => {
            const cached = {
                range: 'all' as const,
                rows: [{ source: 'unikorn', count: 3 }],
            };
            redis.get.mockResolvedValue(cached);

            const result = await service.getSourceBreakdown();

            expect(result).toEqual(cached);
            expect(prisma.$queryRaw).not.toHaveBeenCalled();
        });

        it('maps bigint counts + caches all-time breakdown on miss', async () => {
            redis.get.mockResolvedValue(null);
            prisma.$queryRaw.mockResolvedValue([
                { source: 'unikorn', count: BigInt(7) },
                { source: 'direct', count: BigInt(4) },
            ]);

            const result = await service.getSourceBreakdown();

            expect(result.range).toBe('all');
            expect(result.rows).toEqual([
                { source: 'unikorn', count: 7 },
                { source: 'direct', count: 4 },
            ]);
            expect(redis.set).toHaveBeenCalledWith(
                'admin:stats:sources:all',
                result,
                300
            );
        });

        it('keys cache by range when a window is given', async () => {
            redis.get.mockResolvedValue(null);
            prisma.$queryRaw.mockResolvedValue([]);

            const result = await service.getSourceBreakdown('30d');

            expect(result.range).toBe('30d');
            expect(redis.set).toHaveBeenCalledWith(
                'admin:stats:sources:30d',
                result,
                300
            );
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
