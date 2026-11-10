import {
    Controller,
    Get,
    Inject,
    Logger,
    Optional,
    ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@kmaedu/auth-jwt';
import {
    HealthCheck,
    HealthCheckService,
    HealthIndicatorResult,
    HealthIndicatorService,
} from '@nestjs/terminus';
import {
    DEFAULT_READINESS_TIMEOUT_MS,
    READINESS_CHECKS,
    READINESS_TIMEOUT_MS,
    ReadinessCheck,
} from './readiness-check';

// Probes are hit every few seconds by the orchestrator; never rate-limit them
// and never ask them for credentials (@Public: deny-by-default skips probes).
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
    private readonly logger = new Logger(HealthController.name);
    private readonly timeoutMs: number;

    constructor(
        private readonly health: HealthCheckService,
        private readonly indicators: HealthIndicatorService,
        @Inject(READINESS_CHECKS) private readonly checks: ReadinessCheck[],
        @Optional()
        @Inject(READINESS_TIMEOUT_MS)
        timeoutMs?: number
    ) {
        this.timeoutMs = timeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
    }

    /** Liveness: the process is up and serving HTTP. Checks no dependency. */
    @Get('live')
    @HealthCheck()
    live() {
        return this.health.check([]);
    }

    /**
     * Readiness: 200 only when every registered check passes, else 503.
     * The 503 body carries check names and up/down only; failure detail goes
     * to the server log because driver errors can expose hosts, users and SQL.
     */
    @Get('ready')
    @HealthCheck()
    async ready() {
        try {
            return await this.health.check(
                this.checks.map((check) => () => this.run(check))
            );
        } catch (err) {
            if (!(err instanceof ServiceUnavailableException)) {
                throw err;
            }
            const { details = {} } = err.getResponse() as {
                details?: Record<string, { status: string }>;
            };
            const checks = Object.fromEntries(
                Object.entries(details).map(([name, result]) => [
                    name,
                    result.status === 'up' ? 'up' : 'down',
                ])
            );
            throw new ServiceUnavailableException({ status: 'error', checks });
        }
    }

    private async run(check: ReadinessCheck): Promise<HealthIndicatorResult> {
        const session = this.indicators.check(check.name);
        let timer: NodeJS.Timeout | undefined;
        try {
            await Promise.race([
                check.check(),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () =>
                            reject(
                                new Error(
                                    `Readiness check timed out after ${this.timeoutMs}ms`
                                )
                            ),
                        this.timeoutMs
                    );
                }),
            ]);
            return session.up();
        } catch (err) {
            this.logger.warn(
                `Readiness check "${check.name}" failed: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            return session.down();
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    }
}
