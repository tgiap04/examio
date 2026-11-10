import { Metadata } from '@grpc/grpc-js';
import { ServiceMetadata, forwardUser } from './grpc-metadata';

describe('forwardUser', () => {
    it('forwards the caller bearer token and request id', () => {
        const md = forwardUser({ headers: { authorization: 'Bearer user-jwt', 'x-request-id': 'req_1' } });
        expect(md.get('authorization')).toEqual(['Bearer user-jwt']);
        expect(md.get('x-request-id')).toEqual(['req_1']);
    });

    it('reads the accessToken cookie and never invents x-user-* headers', () => {
        const md = forwardUser({ headers: { cookie: 'accessToken=ck' } });
        expect(md.get('authorization')).toEqual(['Bearer ck']);
        expect(Object.keys(md.getMap()).some((k) => k.startsWith('x-user'))).toBe(false);
        expect(md.get('x-request-id')[0]).toMatch(/^req_/);
    });

    it('sends no authorization when the request has no credentials', () => {
        expect(forwardUser({ headers: {} }).get('authorization')).toEqual([]);
    });
});

describe('ServiceMetadata', () => {
    const tokens = { getToken: jest.fn(async (aud: string) => `svc-${aud}`) };
    const sm = new ServiceMetadata(tokens as never);

    it('asService carries a service token for the audience', async () => {
        const md = await sm.asService('finance', 'req_9');
        expect(md.get('authorization')).toEqual(['Bearer svc-finance']);
        expect(md.get('x-request-id')).toEqual(['req_9']);
    });

    it('attach adds a service token but keeps the request id, without mutating the input', async () => {
        const input = new Metadata();
        input.set('x-request-id', 'req_2');
        const out = await sm.attach(input, 'r2');
        expect(out.get('authorization')).toEqual(['Bearer svc-r2']);
        expect(out.get('x-request-id')).toEqual(['req_2']);
        expect(input.get('authorization')).toEqual([]);
    });

    it('attach never overrides a forwarded user token', async () => {
        const input = new Metadata();
        input.set('authorization', 'Bearer user-jwt');
        tokens.getToken.mockClear();
        const out = await sm.attach(input, 'r2');
        expect(out.get('authorization')).toEqual(['Bearer user-jwt']);
        expect(tokens.getToken).not.toHaveBeenCalled();
    });
});
