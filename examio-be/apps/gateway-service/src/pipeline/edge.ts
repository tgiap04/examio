import type { RequestHandler } from 'express';
import type { RouteTable } from '../routing/route-table';
import { createUpgradeHandler, type UpgradeHandler } from '../ws/ws-upgrade.handler';
import type { TrustFn } from './client-ip';
import { createDispatcher } from './dispatcher.middleware';
import type { GuardChain } from './guard-chain';
import { createRouteProxy, type RouteProxy } from './proxy-factory';
import type { RequestLog } from './request-log';

export interface Edge {
    dispatcher: RequestHandler;
    onUpgrade: UpgradeHandler;
}

export interface EdgeDeps {
    table: RouteTable;
    chain: GuardChain;
    log: RequestLog;
    trust: TrustFn;
}

/** One proxy per gateway-routed (non-`self`) route, shared by HTTP and WebSocket handling. */
export function createEdge(deps: EdgeDeps): Edge {
    const proxies = new Map<string, RouteProxy>(
        deps.table.routes
            .filter((route) => route.target)
            .map((route) => [route.id, createRouteProxy(route)])
    );
    return {
        dispatcher: createDispatcher({ ...deps, proxies }),
        onUpgrade: createUpgradeHandler({ ...deps, proxies }),
    };
}
