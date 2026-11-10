import { createHash } from 'crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ServiceTokenController } from './service-token.controller';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('ServiceTokenController', () => {
    const saved = process.env.SERVICE_CLIENTS;
    let tokens: { signServiceToken: jest.Mock };
    let controller: ServiceTokenController;

    beforeEach(() => {
        process.env.SERVICE_CLIENTS = JSON.stringify({ exam: sha('exam-secret'), admin: sha('admin-secret') });
        tokens = { signServiceToken: jest.fn(async () => ({ token: 'signed.jwt', expiresInSeconds: 300 })) };
        controller = new ServiceTokenController(tokens as never);
    });
    afterEach(() => {
        if (saved === undefined) delete process.env.SERVICE_CLIENTS;
        else process.env.SERVICE_CLIENTS = saved;
    });

    const ok = { client_id: 'exam', client_secret: 'exam-secret', audience: 'admin' };

    it('issues a Bearer token for valid credentials and a known audience', async () => {
        await expect(controller.issue(ok)).resolves.toEqual({
            access_token: 'signed.jwt',
            token_type: 'Bearer',
            expires_in: 300,
        });
        expect(tokens.signServiceToken).toHaveBeenCalledWith('exam', 'admin');
    });

    it('wrong secret -> 401 without signing anything', async () => {
        await expect(controller.issue({ ...ok, client_secret: 'nope' })).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(controller.issue({ ...ok, client_secret: 'admin-secret' })).rejects.toBeInstanceOf(UnauthorizedException);
        expect(tokens.signServiceToken).not.toHaveBeenCalled();
    });

    it('unknown client or unknown audience -> 401 (same generic message)', async () => {
        const errors = await Promise.all([
            controller.issue({ ...ok, client_id: 'ghost' }).catch((e) => e),
            controller.issue({ ...ok, audience: 'nowhere' }).catch((e) => e),
        ]);
        for (const e of errors) {
            expect(e).toBeInstanceOf(UnauthorizedException);
            expect(e.message).toBe('Invalid client credentials');
        }
        expect(tokens.signServiceToken).not.toHaveBeenCalled();
    });

    it.each([
        [undefined],
        [null],
        ['string'],
        [{ client_id: 'exam' }],
        [{ ...ok, extra: 1 }],
        [{ ...ok, client_id: '' }],
        [{ ...ok, audience: 42 }],
    ])('malformed body %p -> 400', async (body) => {
        await expect(controller.issue(body)).rejects.toBeInstanceOf(BadRequestException);
        expect(tokens.signServiceToken).not.toHaveBeenCalled();
    });

    it('fails fast at construction when SERVICE_CLIENTS is missing or invalid', () => {
        delete process.env.SERVICE_CLIENTS;
        expect(() => new ServiceTokenController(tokens as never)).toThrow(/SERVICE_CLIENTS/);
        process.env.SERVICE_CLIENTS = '{bad';
        expect(() => new ServiceTokenController(tokens as never)).toThrow(/SERVICE_CLIENTS/);
    });
});
