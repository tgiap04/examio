import 'reflect-metadata';
import { ALLOW_UNVERIFIED_KEY } from '@examio/common';
import { AuthController } from '../src/auth.controller';

/**
 * Security invariant (phase 01): @AllowUnverified widens access for users who
 * have not verified their email, so it may only sit on these handlers.
 */
const EXPECTED_ALLOW_UNVERIFIED_HANDLERS = [
    'getUser',
    'logout',
    'sendVerificationEmail',
    'verifyAccount',
];

describe('@AllowUnverified allowlist on AuthController', () => {
    it('is applied to exactly logout, sendVerificationEmail, verifyAccount and me', () => {
        const proto = AuthController.prototype as unknown as Record<
            string,
            unknown
        >;
        const flagged = Object.getOwnPropertyNames(proto)
            .filter((name) => typeof proto[name] === 'function')
            .filter(
                (name) =>
                    Reflect.getMetadata(
                        ALLOW_UNVERIFIED_KEY,
                        proto[name] as object
                    ) === true
            )
            .sort();

        expect(flagged).toEqual(EXPECTED_ALLOW_UNVERIFIED_HANDLERS);
    });
});
