import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { RELAY_POOL } from './messaging.constants';

/** Minimal query surface the relay and purge use (and tests fake). */
export interface RelayDb {
    query(
        sql: string,
        params?: unknown[]
    ): Promise<{ rows: any[]; rowCount: number | null }>;
}

const PRISMA_ONLY_PARAMS = ['schema', 'connection_limit', 'pool_timeout', 'pgbouncer'];

/** Prisma-only query params are not valid for node-postgres. */
export function toPgConnectionString(databaseUrl: string): string {
    const url = new URL(databaseUrl);
    for (const key of PRISMA_ONLY_PARAMS) url.searchParams.delete(key);
    return url.toString();
}

/**
 * The relay's own small pool: relay load must never starve the API's Prisma
 * pool. The schema comes from the service role's role-level `search_path`
 * (deploy/postgres/init/01-service-schemas.sh); no `options=-c search_path` is passed.
 */
export function createRelayPool(databaseUrl = process.env.DATABASE_URL): Pool {
    if (!databaseUrl) {
        throw new Error('DATABASE_URL is required for the outbox relay');
    }
    return new Pool({ connectionString: toPgConnectionString(databaseUrl), max: 2 });
}

/**
 * Ends the relay pool at shutdown. It runs in `onApplicationShutdown`, after the
 * relay loop and purge cron have stopped in `beforeApplicationShutdown`, so no
 * query is in flight when the pool closes.
 */
@Injectable()
export class RelayPoolCloser implements OnApplicationShutdown {
    private readonly logger = new Logger(RelayPoolCloser.name);

    constructor(@Inject(RELAY_POOL) private readonly pool: { end(): Promise<void> }) {}

    async onApplicationShutdown(): Promise<void> {
        try {
            await this.pool.end();
        } catch (err) {
            this.logger.warn(`Relay pool did not close cleanly: ${(err as Error).message}`);
        }
    }
}
