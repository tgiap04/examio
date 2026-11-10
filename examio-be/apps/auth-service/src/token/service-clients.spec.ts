import { createHash } from 'crypto';
import {
    SERVICE_AUDIENCES,
    ServiceClients,
    parseServiceClients,
} from './service-clients';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

describe('parseServiceClients', () => {
    it('parses a name -> sha256 map', () => {
        const clients = parseServiceClients(
            JSON.stringify({ exam: hash('s1'), admin: hash('s2') })
        );
        expect(clients).toBeInstanceOf(ServiceClients);
    });

    it('fails fast on missing, non-JSON, non-object, or non-sha256 values', () => {
        expect(() => parseServiceClients(undefined)).toThrow(/SERVICE_CLIENTS/);
        expect(() => parseServiceClients('{oops')).toThrow(/SERVICE_CLIENTS/);
        expect(() => parseServiceClients('[]')).toThrow(/SERVICE_CLIENTS/);
        expect(() => parseServiceClients('{"exam":"plain"}')).toThrow(/sha256/);
        expect(() => parseServiceClients('{"Exam!":"' + hash('x') + '"}')).toThrow(/name/);
    });
});

describe('ServiceClients.authenticate', () => {
    const clients = parseServiceClients(
        JSON.stringify({ exam: hash('exam-secret'), admin: hash('admin-secret') })
    );

    it('accepts the right secret', () => {
        expect(clients.authenticate('exam', 'exam-secret')).toBe(true);
    });

    it('rejects a wrong secret, another client\'s secret, an unknown client and non-strings', () => {
        expect(clients.authenticate('exam', 'nope')).toBe(false);
        expect(clients.authenticate('exam', 'admin-secret')).toBe(false);
        expect(clients.authenticate('ghost', 'exam-secret')).toBe(false);
        expect(clients.authenticate('exam', undefined as unknown as string)).toBe(false);
        expect(clients.authenticate(42 as unknown as string, 'x')).toBe(false);
    });
});

describe('SERVICE_AUDIENCES', () => {
    it('has no finance audience (finance-service was removed)', () => {
        expect(SERVICE_AUDIENCES.has('finance')).toBe(false);
    });

    it('keeps the remaining service audiences', () => {
        expect([...SERVICE_AUDIENCES].sort()).toEqual(
            ['admin', 'ai', 'auth', 'document', 'gateway', 'r2', 'vocabulary'].sort()
        );
    });
});
