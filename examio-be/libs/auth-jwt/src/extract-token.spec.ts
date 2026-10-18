import { Metadata } from '@grpc/grpc-js';
import { extractHttpToken, extractRpcToken } from './extract-token';

const req = (headers: Record<string, string>) => ({ headers }) as never;

describe('extractHttpToken', () => {
    it('prefers the Bearer header over cookies', () => {
        expect(
            extractHttpToken(
                req({
                    authorization: 'Bearer from-header',
                    cookie: 'accessToken=from-cookie; token=legacy',
                })
            )
        ).toBe('from-header');
    });

    it('falls back to cookie accessToken, then the legacy token cookie', () => {
        expect(
            extractHttpToken(req({ cookie: 'accessToken=a; token=legacy' }))
        ).toBe('a');
        expect(extractHttpToken(req({ cookie: 'x=1; token=legacy' }))).toBe(
            'legacy'
        );
    });

    it('returns undefined without credentials or with a non-Bearer scheme', () => {
        expect(extractHttpToken(req({}))).toBeUndefined();
        expect(
            extractHttpToken(req({ authorization: 'Basic abc' }))
        ).toBeUndefined();
        expect(
            extractHttpToken(req({ authorization: 'Bearer ' }))
        ).toBeUndefined();
    });
});

describe('extractRpcToken', () => {
    it('reads the authorization metadata', () => {
        const md = new Metadata();
        md.set('authorization', 'Bearer rpc-token');
        expect(extractRpcToken(md)).toBe('rpc-token');
    });

    it('returns undefined when absent or not Bearer', () => {
        expect(extractRpcToken(new Metadata())).toBeUndefined();
        const md = new Metadata();
        md.set('authorization', 'rpc-token');
        expect(extractRpcToken(md)).toBeUndefined();
        expect(extractRpcToken(undefined)).toBeUndefined();
    });
});
