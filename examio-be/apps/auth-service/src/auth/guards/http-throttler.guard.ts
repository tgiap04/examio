import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Global rate limit for the HTTP surface only. As an APP_GUARD it would also
 * see gRPC calls (hybrid app), where there is no request/response to track:
 * those are authenticated by service/user tokens instead.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
    canActivate(context: ExecutionContext): Promise<boolean> {
        if (context.getType() !== 'http') return Promise.resolve(true);
        return super.canActivate(context);
    }
}
