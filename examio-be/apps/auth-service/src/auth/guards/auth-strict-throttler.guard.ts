import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';

/**
 * Strict rate limiting for auth-sensitive public endpoints.
 * Limits: 5 attempts per 60 seconds per IP.
 * Use @Throttle(5, 60) decorator above each target endpoint to override global 30/min limit.
 *
 * Apply via @UseGuards(AuthStrictThrottlerGuard) + @Throttle(5, 60) on:
 * - login, register, send-code-reset-password, reset-password,
 *   change-password, verify-account, google-one-tap
 */
@Injectable()
export class AuthStrictThrottlerGuard extends ThrottlerGuard {
    protected async throwThrottlingException(
        context: ExecutionContext
    ): Promise<void> {
        throw new ThrottlerException(
            'Too many requests. Please try again later.'
        );
    }

    protected async getTracker(req: Record<string, unknown>): Promise<string> {
        // req.ips is only populated by Express when 'trust proxy' is set,
        // and only reflects hops trusted by that config — unlike reading
        // the x-forwarded-for header directly, it can't be spoofed by a
        // client-supplied header when there is no trusted proxy in front.
        const ips = req['ips'] as string[] | undefined;
        if (ips && ips.length > 0) {
            return ips[0];
        }
        return (req['ip'] as string) || 'unknown';
    }
}