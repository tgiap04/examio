import { DynamicModule, Module } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { Options as PinoHttpOptions } from 'pino-http';
import { ulid } from 'ulid';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Header values we echo back and log verbatim; anything else is replaced. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export const REDACTED_PATHS = [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
];

/**
 * Reuses a well-formed inbound `x-request-id`, otherwise mints `req_<ulid>`,
 * and always echoes the chosen id in the `X-Request-Id` response header.
 */
export function generateRequestId(
    req: IncomingMessage,
    res: ServerResponse
): string {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
    const id =
        candidate && SAFE_REQUEST_ID.test(candidate)
            ? candidate
            : `req_${ulid()}`;
    res.setHeader('X-Request-Id', id);
    return id;
}

/** Health probes fire every few seconds; keep them out of the request log. */
export function isHealthProbe(req: IncomingMessage): boolean {
    return (req.url ?? '').startsWith('/health/');
}

/** The pino-http options the module installs; exported so tests exercise the real config. */
export function buildPinoHttpOptions(service: string): PinoHttpOptions {
    return {
        level: process.env.LOG_LEVEL ?? 'info',
        base: { service },
        genReqId: generateRequestId,
        redact: { paths: REDACTED_PATHS, censor: '[Redacted]' },
        autoLogging: { ignore: isHealthProbe },
    };
}

@Module({})
export class LoggerModule {
    /** JSON request logs (pino) tagged with the owning service name. */
    static forRoot(service: string): DynamicModule {
        return {
            module: LoggerModule,
            imports: [
                PinoLoggerModule.forRoot({
                    pinoHttp: buildPinoHttpOptions(service),
                }),
            ],
        };
    }
}
