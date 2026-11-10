import * as request from 'supertest';
import { AuthApp, PASSWORD, bootAuthApp, uniq } from './helpers/auth-app';

/** The real throttlers (global + strict) on the real login handler. */
describe('login throttling (e2e)', () => {
    let ctx: AuthApp;
    beforeAll(async () => {
        ctx = await bootAuthApp({ realThrottle: true });
    });
    afterAll(() => ctx.close());

    it('5 logins in a minute pass through to the credential check, the 6th is 429: counted once', async () => {
        const email = `${uniq('thr')}@e2e.test`;
        const statuses: number[] = [];
        for (let i = 0; i < 6; i++) {
            const res = await request(ctx.url)
                .post('/api/v1/auth/login')
                .set('x-device-id', `dev-${i}`)
                .send({ credential: email, password: PASSWORD });
            statuses.push(res.status);
        }
        // 401 = reached the credential check (unknown user); 429 = throttled.
        expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    });
});
