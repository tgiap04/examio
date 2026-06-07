import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Observable, Subject } from 'rxjs';
import { redactPII } from './log-redactor.util';

export type WatchableService = 'auth' | 'gateway';

const LOG_FILENAME: Record<WatchableService, string> = {
    auth: 'auth-service.log',
    gateway: 'gateway-service.log',
};

/**
 * Tails service log files and emits new lines as they are appended.
 *
 * Per service key we keep a single fs.FSWatcher and a single rxjs Subject.
 * Multiple subscribers share the same watcher via Subject multicast.
 * On dispose we close the watcher and complete the subject.
 */
@Injectable()
export class LogWatcherService implements OnModuleDestroy {
    private readonly logger = new Logger(LogWatcherService.name);
    private readonly watchers = new Map<string, fs.FSWatcher>();
    private readonly subjects = new Map<string, Subject<string>>();
    private readonly lastSize = new Map<string, number>();

    private resolveLogPath(service: WatchableService): string {
        const logsDir = process.env.LOGS_DIR || '/var/log/examio';
        return path.join(logsDir, LOG_FILENAME[service]);
    }

    watch(service: WatchableService): Observable<string> {
        let subject = this.subjects.get(service);
        if (!subject) {
            subject = new Subject<string>();
            this.subjects.set(service, subject);
            this.startWatcher(service, subject);
        }
        return subject.asObservable();
    }

    /**
     * Stop watching a service and complete its subject.
     */
    dispose(service: WatchableService): void {
        const watcher = this.watchers.get(service);
        if (watcher) {
            try {
                watcher.close();
            } catch (err) {
                this.logger.warn(
                    `Error closing watcher for ${service}: ${(err as Error).message}`
                );
            }
            this.watchers.delete(service);
        }
        const subject = this.subjects.get(service);
        if (subject) {
            subject.complete();
            this.subjects.delete(service);
        }
        this.lastSize.delete(service);
    }

    onModuleDestroy(): void {
        for (const key of Array.from(this.watchers.keys())) {
            this.dispose(key as WatchableService);
        }
    }

    private startWatcher(service: WatchableService, subject: Subject<string>): void {
        const filePath = this.resolveLogPath(service);
        let stream: fs.ReadStream | null = null;

        const closeStream = () => {
            if (stream) {
                try {
                    stream.destroy();
                } catch {
                    /* noop */
                }
                stream = null;
            }
        };

        const readNewLines = () => {
            try {
                if (!fs.existsSync(filePath)) {
                    return;
                }
                const stat = fs.statSync(filePath);
                const previousSize = this.lastSize.get(service) ?? 0;

                // If file was truncated or rotated, restart from beginning.
                const start = stat.size < previousSize ? 0 : previousSize;

                if (start >= stat.size) {
                    this.lastSize.set(service, stat.size);
                    return;
                }

                closeStream();
                stream = fs.createReadStream(filePath, {
                    start,
                    end: stat.size,
                    encoding: 'utf8',
                });

                let buffer = '';
                stream.on('data', (chunk: string) => {
                    buffer += chunk;
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';
                    for (const line of lines) {
                        if (line.length === 0) continue;
                        subject.next(redactPII(line));
                    }
                });
                stream.on('end', () => {
                    if (buffer.length > 0) {
                        subject.next(redactPII(buffer));
                        buffer = '';
                    }
                    this.lastSize.set(service, stat.size);
                });
                stream.on('error', (err) => {
                    this.logger.error(
                        `Read stream error for ${service}: ${err.message}`
                    );
                });
            } catch (err) {
                this.logger.error(
                    `readNewLines error for ${service}: ${(err as Error).message}`
                );
            }
        };

        try {
            readNewLines();

            const watcher = fs.watch(filePath, { persistent: true }, () => {
                readNewLines();
            });
            watcher.on('error', (err) => {
                this.logger.error(
                    `fs.watch error for ${service}: ${err.message}`
                );
            });
            this.watchers.set(service, watcher);
        } catch (err) {
            this.logger.error(
                `Failed to start watcher for ${service}: ${(err as Error).message}`
            );
        }
    }
}
