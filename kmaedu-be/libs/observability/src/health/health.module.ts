import { DynamicModule, Module, Type } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import {
    READINESS_CHECKS,
    READINESS_TIMEOUT_MS,
    ReadinessCheck,
} from './readiness-check';

export interface HealthModuleOptions {
    /**
     * Injectable classes implementing `ReadinessCheck`. They are instantiated
     * inside this module, so their own dependencies (PrismaService,
     * RedisService, ...) must come from `@Global()` modules.
     */
    checks?: Type<ReadinessCheck>[];
    /** Per-check timeout in ms (default 3000). */
    timeoutMs?: number;
}

/**
 * Registers `GET /health/live` and `GET /health/ready`.
 * Apps must exclude these two routes from any global prefix, see
 * `HEALTH_ROUTES_EXCLUDED_FROM_PREFIX`.
 */
@Module({})
export class HealthModule {
    static forRoot(options: HealthModuleOptions = {}): DynamicModule {
        const checks = options.checks ?? [];
        return {
            module: HealthModule,
            imports: [TerminusModule.forRoot({ errorLogStyle: 'json' })],
            controllers: [HealthController],
            providers: [
                ...checks,
                {
                    provide: READINESS_CHECKS,
                    useFactory: (...instances: ReadinessCheck[]) => instances,
                    inject: checks,
                },
                ...(options.timeoutMs === undefined
                    ? []
                    : [
                          {
                              provide: READINESS_TIMEOUT_MS,
                              useValue: options.timeoutMs,
                          },
                      ]),
            ],
        };
    }
}

/** Pass as `exclude` to `app.setGlobalPrefix(...)` so probes stay at /health/*. */
export const HEALTH_ROUTES_EXCLUDED_FROM_PREFIX = [
    'health/live',
    'health/ready',
];
