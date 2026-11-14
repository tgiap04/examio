import { Global, Module } from '@nestjs/common';
import type { MessagingDb } from '@kmaedu/messaging';

export const GATEWAY_NO_DB = Symbol('GATEWAY_NO_DB');

/**
 * The messaging consumer wants a transactional DB for deduped handlers. The
 * gateway has no database, so its handlers must declare `{ dedupe: false }`
 * (idempotent by construction); anything else fails loudly instead of silently.
 */
const noDb: MessagingDb = {
    $transaction() {
        return Promise.reject(
            new Error('The gateway has no database: use @EventHandler(type, { dedupe: false })')
        );
    },
};

@Global()
@Module({
    providers: [{ provide: GATEWAY_NO_DB, useValue: noDb }],
    exports: [GATEWAY_NO_DB],
})
export class GatewayNoDbModule {}
