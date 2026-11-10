import type { IncomingMessage } from 'http';
import { clientIp, forwardedHost, forwardedProto, trustHops } from './client-ip';

const req = (remote: string | undefined, headers: Record<string, string> = {}) =>
    ({ socket: { remoteAddress: remote }, headers }) as unknown as IncomingMessage;

describe('client ip (one trusted hop, RT-15)', () => {
    const trust = trustHops(1);

    it('takes the entry the trusted hop appended, never the client-controlled leftmost one', () => {
        expect(
            clientIp(req('172.18.0.5', { 'x-forwarded-for': '6.6.6.6, 10.0.0.9' }), trust)
        ).toBe('10.0.0.9');
    });

    it('is not moved by extra spoofed entries or a spoofed single entry from the peer', () => {
        expect(
            clientIp(req('172.18.0.5', { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3, 10.0.0.9' }), trust)
        ).toBe('10.0.0.9');
        expect(clientIp(req('172.18.0.5', { 'x-forwarded-for': '10.0.0.9' }), trust)).toBe('10.0.0.9');
    });

    it('falls back to the socket address when there is no header', () => {
        expect(clientIp(req('203.0.113.7'), trust)).toBe('203.0.113.7');
    });

    it('normalises IPv4-mapped IPv6 so one client has one limiter key', () => {
        expect(clientIp(req('::ffff:203.0.113.7'), trust)).toBe('203.0.113.7');
    });

    it('never throws on a missing socket address', () => {
        expect(clientIp(req(undefined), trust)).toBe('unknown');
    });

    it('takes proto from the trusted hop and the public host from Host, never a client X-Forwarded-Host', () => {
        const r = req('172.18.0.5', {
            'x-forwarded-proto': 'https, http',
            'x-forwarded-host': 'evil.example',
            host: 'kmaedu.fayedark.com',
        });
        expect(forwardedProto(r)).toBe('https');
        expect(forwardedHost(r)).toBe('kmaedu.fayedark.com');
        expect(forwardedProto(req('1.1.1.1'))).toBe('http');
        expect(forwardedHost(req('1.1.1.1', { host: 'gw:7000' }))).toBe('gw:7000');
    });
});
