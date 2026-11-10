import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { Logger } from '@nestjs/common';
import type { RouteTable } from '../routing/route-table';
import { clientIp, forwardedHost, forwardedProto, type TrustFn } from '../pipeline/client-ip';
import { pathnameOf } from '../pipeline/dispatcher.middleware';
import { rejectUpgrade } from '../pipeline/error-response';
import { resolveRequestId } from '../pipeline/forward-headers';
import type { GuardChain } from '../pipeline/guard-chain';
import { prepareUpgradeRequest } from '../pipeline/prepare-request';
import type { RouteProxy } from '../pipeline/proxy-factory';

export interface UpgradeDeps {
    table: RouteTable;
    chain: GuardChain;
    proxies: ReadonlyMap<string, RouteProxy>;
    trust: TrustFn;
}

export type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void;

const logger = new Logger('WsUpgrade');

/**
 * Authenticated WebSocket upgrade: match a `websocket: true` route, then run the
 * same checks as HTTP (token verify, revoke/`av`, page flag, `ws-upgrade` limit)
 * keyed on the client address computed with the shared trust function. Only then
 * is the handshake handed to the proxy. socket.io's own `auth` payload is not
 * visible here, so the study-room service re-verifies in its socket middleware.
 */
export function createUpgradeHandler(deps: UpgradeDeps): UpgradeHandler {
    const { table, chain, proxies, trust } = deps;

    return (req, socket, head) => {
        socket.on('error', () => socket.destroy());

        const pathname = pathnameOf(req.url);
        const route = table.match('GET', pathname);
        const proxy = route && proxies.get(route.id);
        if (!route?.websocket || !proxy?.upgrade) {
            rejectUpgrade(socket, 404, 'ROUTE_NOT_FOUND');
            return;
        }

        const ip = clientIp(req, trust);
        void chain
            .run({ method: 'UPGRADE', pathname, headers: req.headers, route, ip })
            .then((decision) => {
                if (!decision.ok) {
                    rejectUpgrade(socket, decision.status, decision.code);
                    return;
                }
                prepareUpgradeRequest(req, {
                    requestId: resolveRequestId(req.headers),
                    mode: decision.mode,
                    token: decision.token,
                    stripToken: decision.stripToken,
                    ip,
                    proto: forwardedProto(req),
                    host: forwardedHost(req),
                });
                proxy.upgrade!(req, socket, head);
            })
            .catch((err: unknown) => {
                logger.error(`Upgrade failure: ${err instanceof Error ? err.stack : String(err)}`);
                rejectUpgrade(socket, 500, 'INTERNAL_ERROR');
            });
    };
}
