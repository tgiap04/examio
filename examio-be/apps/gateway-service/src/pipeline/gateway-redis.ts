import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RedisService } from '@examio/redis';
import type { AuthStateRedis } from './auth-state.service';
import type { RateLimitStore } from './rate-limiter.service';

/** Scripts load from the bundle directory (Nest asset copy) or, in dev/jest, from this directory. */
export function readLua(name: string): string {
    const candidates = [join(__dirname, name), join(__dirname, 'pipeline', name)];
    const found = candidates.find((p) => existsSync(p));
    if (!found) throw new Error(`Lua script ${name} not found (looked in ${candidates.join(', ')})`);
    return readFileSync(found, 'utf8');
}

interface GatewayCommands {
    gwSetMax(key: string, candidate: number): Promise<number>;
    gwRateLimit(key: string, windowMs: number): Promise<[number, number]>;
}
type GatewayClient = Redis & GatewayCommands;

/**
 * The shared ioredis connection plus the gateway's two Lua commands. Commands
 * are refused up front when the connection is not ready, so an outage fails
 * fast instead of piling up in ioredis's offline queue.
 */
@Injectable()
export class GatewayRedis implements AuthStateRedis, RateLimitStore {
    private readonly defined = new WeakSet<object>();

    constructor(private readonly redis: RedisService) {}

    mget(...keys: string[]): Promise<(string | null)[]> {
        return this.client().mget(...keys);
    }

    setMax(key: string, value: number): Promise<unknown> {
        return this.client().gwSetMax(key, value);
    }

    setRevoked(key: string, ttlSeconds: number): Promise<unknown> {
        return this.client().set(key, '1', 'EX', ttlSeconds);
    }

    async hit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }> {
        const [count, ttlMs] = await this.client().gwRateLimit(key, windowMs);
        return { count, ttlMs };
    }

    private client(): GatewayClient {
        const client = this.redis.getClient();
        if (!client || client.status !== 'ready') {
            throw new Error(`Redis is not ready (${client?.status ?? 'not started'})`);
        }
        if (!this.defined.has(client)) {
            client.defineCommand('gwSetMax', { numberOfKeys: 1, lua: readLua('set-max.lua') });
            client.defineCommand('gwRateLimit', { numberOfKeys: 1, lua: readLua('rate-limit.lua') });
            this.defined.add(client);
        }
        return client as GatewayClient;
    }
}
