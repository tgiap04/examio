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
        const forwarded = req['x-forwarded-for'] as string | undefined;
        if (forwarded) {
            return forwarded.split(',')[0].trim();
        }
        return (req['ip'] as string) || 'unknown';
    }
}