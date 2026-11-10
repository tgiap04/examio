import { redactPII } from './log-redactor.util';

describe('redactPII', () => {
    it('redacts email addresses', () => {
        const line = 'User signed in: alice@example.com from 1.2.3.4';
        const result = redactPII(line);
        expect(result).toBe('User signed in: [REDACTED] from 1.2.3.4');
        expect(result).not.toContain('alice@example.com');
    });

    it('redacts Bearer tokens', () => {
        const line = 'Authorization: Bearer abc123.def456 token';
        const result = redactPII(line);
        expect(result).toContain('Bearer [REDACTED]');
        expect(result).not.toContain('abc123.def456');
    });

    it('redacts password fields in JSON', () => {
        const line = 'Body: {"username":"alice","password":"hunter2","email":"a@b.com"}';
        const result = redactPII(line);
        expect(result).toContain('"password":"[REDACTED]"');
        expect(result).not.toContain('hunter2');
    });

    it('redacts JWT tokens', () => {
        const jwt =
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.signature';
        const line = `token=${jwt} done`;
        const result = redactPII(line);
        expect(result).toContain('[REDACTED]');
        expect(result).not.toContain(jwt);
    });

    it('preserves line structure around redactions', () => {
        const line = 'GET /login user=alice@example.com status=200';
        const result = redactPII(line);
        expect(result.startsWith('GET /login')).toBe(true);
        expect(result.endsWith('status=200')).toBe(true);
    });

    it('returns the line unchanged when nothing matches', () => {
        const line = 'INFO request handled in 12ms';
        expect(redactPII(line)).toBe(line);
    });
});
