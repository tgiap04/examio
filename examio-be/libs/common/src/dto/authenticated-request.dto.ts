import { Request } from 'express';
import type { AuthUser } from '@examio/auth-jwt';

/**
 * Request object with the verified access-token principal (set by the global
 * `JwtAuthGuard` from `@examio/auth-jwt`). It carries the token claims only
 * (`id`, `sid`, `roles`, `emailVerified`, `av`): load anything else from the
 * database by `id`.
 */
export interface AuthenticatedRequest extends Request {
    user: AuthUser;
}
