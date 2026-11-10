import { createEnvelope, parseEnvelope, domainOf } from './envelope';
import { PermanentEventError } from './errors';

const ULID_ID = /^evt_[0-9A-HJKMNP-TV-Z]{26}$/;

describe('createEnvelope', () => {
    it('builds the v1 envelope with a ulid id and ISO timestamp', () => {
        const env = createEnvelope(
            'auth.user.registered',
            { userId: 'u1' },
            { source: 'auth' }
        );

        expect(env.id).toMatch(ULID_ID);
        expect(env.type).toBe('auth.user.registered');
        expect(env.version).toBe(1);
        expect(env.source).toBe('auth');
        expect(env.data).toEqual({ userId: 'u1' });
        expect(new Date(env.occurredAt).toISOString()).toBe(env.occurredAt);
        expect(env.correlationId).toEqual(expect.any(String));
    });

    it('keeps a supplied correlation id', () => {
        const env = createEnvelope(
            'auth.user.registered',
            {},
            { source: 'auth', correlationId: 'req_1' }
        );
        expect(env.correlationId).toBe('req_1');
    });

    it('rejects a source that is not the domain of the type', () => {
        expect(() =>
            createEnvelope('auth.user.registered', {}, { source: 'exam' })
        ).toThrow(/source/);
    });

    it('throws for a state event without a numeric data.version', () => {
        expect(() =>
            createEnvelope('exam.room.updated', {}, { source: 'exam' })
        ).toThrow(/data\.version/);
        expect(() =>
            createEnvelope(
                'exam.room.updated',
                { version: '1' },
                { source: 'exam' }
            )
        ).toThrow(/data\.version/);
    });

    it('accepts a state event with a numeric data.version', () => {
        const env = createEnvelope(
            'exam.room.updated',
            { version: 1700000000000 },
            { source: 'exam' }
        );
        expect(env.data).toEqual({ version: 1700000000000 });
    });

    it('requires data.authzVersion for the authz event', () => {
        expect(() =>
            createEnvelope(
                'auth.user.authz_changed',
                { version: 3 },
                { source: 'auth' }
            )
        ).toThrow(/data\.authzVersion/);
        expect(() =>
            createEnvelope(
                'auth.user.authz_changed',
                { authzVersion: 3 },
                { source: 'auth' }
            )
        ).not.toThrow();
    });
});

describe('parseEnvelope', () => {
    const valid = () =>
        createEnvelope('auth.user.registered', { a: 1 }, { source: 'auth' });

    it('round-trips a valid envelope', () => {
        const env = valid();
        expect(parseEnvelope(JSON.parse(JSON.stringify(env)))).toEqual(env);
    });

    it('rejects version 2 as a permanent error', () => {
        const raw = { ...valid(), version: 2 };
        expect(() => parseEnvelope(raw)).toThrow(PermanentEventError);
        try {
            parseEnvelope(raw);
        } catch (e) {
            expect((e as PermanentEventError).code).toBe('UNSUPPORTED_VERSION');
        }
    });

    it('rejects a malformed envelope as a permanent error', () => {
        expect(() => parseEnvelope({ id: 'x' })).toThrow(PermanentEventError);
        expect(() => parseEnvelope(null)).toThrow(PermanentEventError);
    });
});

describe('domainOf', () => {
    it('returns the first routing key segment', () => {
        expect(domainOf('auth.user.registered')).toBe('auth');
        expect(domainOf('single')).toBe('single');
    });
});
