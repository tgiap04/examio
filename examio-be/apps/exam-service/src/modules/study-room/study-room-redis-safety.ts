import { ArgumentsHost, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import { MaxRetriesPerRequestError } from 'ioredis/built/errors';
import { ServerEvents } from './study-room.events';

/**
 * ioredis gives up on a queued command with `MaxRetriesPerRequestError` once
 * it has retried the connection too often, or with `Connection is closed.`
 * after the client was closed. Both mean "Redis is unreachable", not a bug.
 */
export function isRedisUnavailable(err: unknown): boolean {
    return (
        err instanceof MaxRetriesPerRequestError ||
        (err instanceof Error && err.message === 'Connection is closed.')
    );
}

/**
 * Runs a fire-and-forget async task (lifecycle hook, timer) so it can never
 * become an unhandled rejection: socket.io, Nest and `setInterval` do not
 * catch the promise those callbacks return, and a rejection from ioredis'
 * flushed command queue then kills the process. Failures are logged, never
 * rethrown. `label` must carry ids only (room/user), no secrets.
 */
export async function runSafely(
    logger: Pick<Logger, 'warn'>,
    label: string,
    fn: () => Promise<void>
): Promise<void> {
    try {
        await fn();
    } catch (err) {
        logger.warn(
            `${label} failed: ${err instanceof Error ? err.message : String(err)}`
        );
    }
}

/**
 * `@SubscribeMessage` handlers that hit Redis during an outage answer the
 * caller with a `SERVICE_UNAVAILABLE` error event (same `{ code, message }`
 * shape as every other study-room error) instead of Nest's generic
 * "Internal server error". Any other exception keeps the default handling.
 */
export class StudyRoomWsExceptionFilter extends BaseWsExceptionFilter {
    private readonly logger = new Logger(StudyRoomWsExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        if (!isRedisUnavailable(exception)) {
            super.catch(exception, host);
            return;
        }
        const client = host.switchToWs().getClient<{ emit: (...a: unknown[]) => void }>();
        this.logger.warn(
            `Redis unavailable while handling a study-room message: ${(exception as Error).message}`
        );
        client.emit(ServerEvents.ERROR, {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Dịch vụ tạm thời không khả dụng, vui lòng thử lại',
        });
    }
}
