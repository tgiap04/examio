import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNVERIFIED_KEY = 'allowUnverified';

/**
 * Lets a user whose email is not yet verified pass `AuthGuard` on this handler.
 * Banned / deleted users and invalid sessions are still rejected.
 *
 * Security: only the handlers an unverified user needs to finish onboarding
 * (logout, resend verification, verify, read own profile) may carry this.
 * `apps/auth-service/test/allow-unverified-allowlist.spec.ts` pins that list.
 */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);
