import 'reflect-metadata';
import { ALLOW_UNVERIFIED_KEY } from '@kmaedu/auth-jwt';
import { AuthController } from '../src/auth.controller';
import { DevicesController } from '../src/devices/devices.controller';
import { ProfileController } from '../src/profile/profile.controller';

/**
 * Security invariant (RT-6): @AllowUnverified widens access for users who have
 * not verified their email, so it may only sit on these handlers (plus the
 * whole `devices` controller). The list is pinned; changing it needs review.
 */
const EXPECTED_ALLOW_UNVERIFIED_HANDLERS = [
    'changePassword',
    'getUser', // GET /auth/me
    'logout',
    'sendCodeChangePassword',
    'sendVerificationEmail',
    'syncRefreshToken',
    'verifyAccount',
];

function flagged(controller: { prototype: object }): string[] {
    const proto = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(proto)
        .filter((name) => typeof proto[name] === 'function')
        .filter(
            (name) =>
                Reflect.getMetadata(ALLOW_UNVERIFIED_KEY, proto[name] as object) ===
                true
        )
        .sort();
}

describe('@AllowUnverified allowlist', () => {
    it('is applied to exactly the pinned AuthController handlers', () => {
        expect(flagged(AuthController)).toEqual(EXPECTED_ALLOW_UNVERIFIED_HANDLERS);
    });

    it('is applied to the devices controller as a whole', () => {
        expect(Reflect.getMetadata(ALLOW_UNVERIFIED_KEY, DevicesController)).toBe(true);
    });

    it('is not applied anywhere on the profile controller', () => {
        expect(flagged(ProfileController)).toEqual([]);
        expect(Reflect.getMetadata(ALLOW_UNVERIFIED_KEY, ProfileController)).toBeUndefined();
    });
});
