export const EVENTS_EXCHANGE = 'examio.events';
export const RETRY_DELAY_MS = 30_000;
export const MAX_RETRIES = 5;
export const PREFETCH = 10;

export interface TopologyNames {
    events: string;
    retryExchange: string;
    retryQueue: string;
    requeueExchange: string;
    deadExchange: string;
    dlq: string;
}

export function topologyNames(svc: string): TopologyNames {
    return {
        events: `${svc}.events`,
        retryExchange: `${svc}.retry`,
        retryQueue: `${svc}.retry.30s`,
        requeueExchange: `${svc}.requeue`,
        deadExchange: `${svc}.dead`,
        dlq: `${svc}.dlq`,
    };
}

/** The slice of an amqplib channel the topology needs. */
export interface TopologyChannel {
    assertExchange(
        name: string,
        type: string,
        options?: Record<string, unknown>
    ): Promise<unknown>;
    assertQueue(
        name: string,
        options?: Record<string, unknown>
    ): Promise<unknown>;
    bindQueue(queue: string, exchange: string, key: string): Promise<unknown>;
}

/**
 * Idempotently declares the shared topic exchange and the per-service
 * events / retry / requeue / dead-letter topology. Retry and DLQ routing use
 * per-service fanout exchanges (never the default exchange): fanout without
 * `x-dead-letter-routing-key` keeps the original routing key while
 * dead-lettering, and needs no write access to the default exchange.
 */
export async function declareTopology(
    ch: TopologyChannel,
    svc: string
): Promise<TopologyNames> {
    const n = topologyNames(svc);
    await ch.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
    for (const name of [n.retryExchange, n.requeueExchange, n.deadExchange]) {
        await ch.assertExchange(name, 'fanout', { durable: true });
    }
    await ch.assertQueue(n.events, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': n.deadExchange },
    });
    await ch.assertQueue(n.retryQueue, {
        durable: true,
        arguments: {
            'x-message-ttl': RETRY_DELAY_MS,
            'x-dead-letter-exchange': n.requeueExchange,
        },
    });
    await ch.assertQueue(n.dlq, { durable: true });
    await ch.bindQueue(n.retryQueue, n.retryExchange, '');
    await ch.bindQueue(n.events, n.requeueExchange, '');
    await ch.bindQueue(n.dlq, n.deadExchange, '');
    return n;
}
