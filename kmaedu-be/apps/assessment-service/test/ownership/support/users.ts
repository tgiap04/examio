import type { AssessmentTestApp, TestUser } from './assessment-test-app';
import type { ContentBackend } from './fake-content';

/** Any harness, whatever content backend it runs on. */
type AnyApp = AssessmentTestApp<ContentBackend>;
import { keysDeep } from './http';

export type TokenUser = TestUser & { token: string };

async function as(t: AnyApp, roles: TestUser['roles']): Promise<TokenUser> {
    const user = await t.createUser(roles);
    return { ...user, token: await t.tokenFor(user) };
}

export const teacher = (t: AnyApp) => as(t, ['TEACHER']);
export const student = (t: AnyApp) => as(t, ['STUDENT']);
export const admin = (t: AnyApp) => as(t, ['SYSTEM_ADMIN']);

/** Keys that must never reach a student-facing (or any non-host) response. */
export const SECRET_KEYS = ['answer', 'isCorrect', 'accessCode', 'whitelist', 'codeGrantedIds', 'email', 'quizSnapshot'] as const;

/** The JSON-key scan of the contract: no secret key anywhere in `body`, except the ones `allow`ed. */
export function secretKeysIn(body: unknown, allow: readonly string[] = []): string[] {
    const keys = keysDeep(body);
    return SECRET_KEYS.filter((k) => keys.has(k) && !allow.includes(k));
}
