import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    signTestToken,
    type TestKeyPair,
} from '@examio/auth-jwt/testing';
import { createTokenVerifier, type TokenVerifier } from '@examio/auth-jwt';

export type Actor = 'STUDENT' | 'TEACHER' | 'ADMIN_ONLY' | 'TEACHER_ADMIN';

export const ACTOR_ROLES: Record<Actor, string[]> = {
    STUDENT: ['STUDENT'],
    TEACHER: ['TEACHER'],
    // synthetic, permission-level only: a SYSTEM_ADMIN without a base-role content permission
    ADMIN_ONLY: ['SYSTEM_ADMIN'],
    TEACHER_ADMIN: ['TEACHER', 'SYSTEM_ADMIN'],
};

export interface TestAuth {
    keys: TestKeyPair;
    verifier: TokenVerifier;
    /** Bearer token for a synthetic user holding `actor`'s roles. */
    token(actor: Actor, userId?: string): Promise<string>;
}

export async function createTestAuth(): Promise<TestAuth> {
    const keys = await createTestKeyPair('matrix-kid');
    const verifier = createTokenVerifier({
        issuer: TEST_ISSUER,
        audiences: [TEST_AUDIENCE, 'exam'],
        localJwks: { keys: [keys.publicJwk] },
    });
    return {
        keys,
        verifier,
        token: (actor, userId = `user-${actor.toLowerCase()}`) =>
            signTestToken(keys, {
                claims: {
                    sub: userId,
                    roles: ACTOR_ROLES[actor],
                    sid: `sid-${userId}`,
                    email_verified: true,
                    av: 0,
                },
            }),
    };
}
