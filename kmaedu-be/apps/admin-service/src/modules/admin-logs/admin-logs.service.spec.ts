import { Test, TestingModule } from '@nestjs/testing';
import { Subject } from 'rxjs';
import { take } from 'rxjs/operators';
import { AdminLogsService } from './admin-logs.service';
import { RedisLogService, LogEntry, WatchableService } from './redis-log.service';

const makeEntry = (svc: WatchableService, line: string): LogEntry => ({
    ts: new Date().toISOString(),
    service: svc,
    line,
    redacted: line,
});

describe('AdminLogsService', () => {
    let service: AdminLogsService;
    let mockRedisLog: jest.Mocked<Pick<RedisLogService, 'getRecent' | 'subscribe'>>;

    beforeEach(async () => {
        mockRedisLog = {
            getRecent: jest.fn(),
            subscribe: jest.fn().mockReturnValue(() => {}),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AdminLogsService,
                { provide: RedisLogService, useValue: mockRedisLog },
            ],
        }).compile();

        service = module.get(AdminLogsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getRecent', () => {
        it('returns redacted lines in chronological order (oldest first)', async () => {
            // Redis LRANGE returns newest-first (LPUSH), so service reverses
            mockRedisLog.getRecent.mockResolvedValue([
                makeEntry('auth', 'line3'),
                makeEntry('auth', 'line2'),
                makeEntry('auth', 'line1'),
            ]);

            const lines = await service.getRecent('auth', 3);
            expect(lines).toEqual(['line1', 'line2', 'line3']);
            expect(mockRedisLog.getRecent).toHaveBeenCalledWith('auth', 3);
        });

        it('returns empty array when no logs exist', async () => {
            mockRedisLog.getRecent.mockResolvedValue([]);
            const lines = await service.getRecent('gateway', 100);
            expect(lines).toEqual([]);
        });
    });

    describe('stream', () => {
        it('subscribes to RedisLogService and emits { data: { line } }', (done) => {
            let capturedHandler: (entry: LogEntry) => void = () => {};
            mockRedisLog.subscribe.mockImplementation((_svc, handler) => {
                capturedHandler = handler;
                return () => {};
            });

            const obs = service.stream('gateway');
            obs.pipe(take(1)).subscribe({
                next: (event) => {
                    expect(event).toEqual({ data: { line: 'GET /health 200 1ms' } });
                    done();
                },
            });

            // Emit after subscription is set up
            capturedHandler(makeEntry('gateway', 'GET /health 200 1ms'));
        });

        it('reuses the same observable for repeated calls to the same service', () => {
            const obs1 = service.stream('auth');
            const obs2 = service.stream('auth');
            expect(obs1).toBe(obs2);
            expect(mockRedisLog.subscribe).toHaveBeenCalledTimes(1);
        });

        it('creates separate observables for different services', () => {
            const obs1 = service.stream('auth');
            const obs2 = service.stream('gateway');
            expect(obs1).not.toBe(obs2);
            expect(mockRedisLog.subscribe).toHaveBeenCalledTimes(2);
        });
    });
});
