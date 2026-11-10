import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, map } from 'rxjs';
import { RedisLogService, LogEntry, WatchableService } from './redis-log.service';

@Injectable()
export class AdminLogsService implements OnModuleDestroy {
    private readonly logger = new Logger(AdminLogsService.name);
    private readonly unsubscribers = new Map<string, () => void>();
    private readonly subjects = new Map<string, Subject<string>>();
    private readonly observables = new Map<string, Observable<{ data: { line: string } }>>();

    constructor(private readonly redisLog: RedisLogService) {}

    async getRecent(service: WatchableService, limit: number): Promise<string[]> {
        const entries = await this.redisLog.getRecent(service, limit);
        // Return redacted lines, newest last (reverse for chronological order)
        return entries.reverse().map((e) => e.redacted);
    }

    stream(service: WatchableService): Observable<{ data: { line: string } }> {
        let obs = this.observables.get(service);
        if (!obs) {
            const subject = new Subject<string>();
            this.subjects.set(service, subject);
            this.startSubscription(service, subject);
            obs = subject.asObservable().pipe(map((line) => ({ data: { line } })));
            this.observables.set(service, obs);
        }
        return obs;
    }

    onModuleDestroy(): void {
        for (const [svc, unsub] of this.unsubscribers) {
            try { unsub(); } catch { /* noop */ }
            this.logger.debug(`Unsubscribed from logs:stream:${svc}`);
        }
        this.unsubscribers.clear();
        for (const subject of this.subjects.values()) {
            subject.complete();
        }
        this.subjects.clear();
        this.observables.clear();
    }

    private startSubscription(service: WatchableService, subject: Subject<string>): void {
        const unsub = this.redisLog.subscribe(service, (entry: LogEntry) => {
            subject.next(entry.redacted);
        });
        this.unsubscribers.set(service, unsub);
    }
}
