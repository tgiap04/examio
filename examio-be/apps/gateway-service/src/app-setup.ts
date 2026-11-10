import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@examio/observability';
import { HttpErrorEnvelopeFilter } from '@examio/http';
import { buildCorsOptions } from './cors-options';
import { createEdge } from './pipeline/edge';
import type { TrustFn } from './pipeline/client-ip';
import { GuardChain } from './pipeline/guard-chain';
import { RequestLog } from './pipeline/request-log';
import { RouteTable } from './routing/route-table';
import type { UpgradeHandler } from './ws/ws-upgrade.handler';

/**
 * Edge wiring shared by `main.ts` and the e2e suite. Order matters: helmet,
 * CORS (it answers every `OPTIONS` preflight, so the dispatcher never sees one),
 * cookies, then the dispatcher. The app must be created with `bodyParser: false`
 * so request bodies stream to the upstream untouched.
 *
 * Returns the `upgrade` listener to attach after `listen()`.
 */
export function configureGatewayApp(app: NestExpressApplication): UpgradeHandler {
    const express = app.getHttpAdapter().getInstance();
    // nginx is the one trusted hop. HTTP (`req.ip`) and raw WebSocket upgrades
    // both derive the client address from this same function.
    express.set('trust proxy', 1);
    const trust = express.get('trust proxy fn') as TrustFn;

    // Same options as before the rewrite; the CSP no longer needs Swagger's
    // inline assets but is kept so the response headers do not change.
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: [`'self'`],
                    scriptSrc: [`'self'`, `'unsafe-inline'`],
                    styleSrc: [`'self'`, `'unsafe-inline'`],
                    imgSrc: [`'self'`, 'data:', 'https:'],
                },
            },
        })
    );
    app.enableCors(buildCorsOptions());
    app.use(cookieParser());

    const edge = createEdge({
        table: app.get(RouteTable),
        chain: app.get(GuardChain),
        log: app.get(RequestLog),
        trust,
    });
    app.use(edge.dispatcher);

    app.setGlobalPrefix('api/v1', { exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX });
    app.useGlobalFilters(new HttpErrorEnvelopeFilter());
    return edge.onUpgrade;
}
