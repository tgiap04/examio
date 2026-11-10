import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { rethrowKnown } from './rethrow-known';

describe('rethrowKnown', () => {
    it('lets HttpExceptions through untouched', () => {
        const e = new BadRequestException('x');
        expect(() => rethrowKnown(e)).toThrow(e);
    });
    it.each([
        ['P2025', NotFoundException],
        ['P2002', ConflictException],
        ['P2003', BadRequestException],
    ])('maps Prisma %s', (code, cls) => {
        expect(() => rethrowKnown({ code })).toThrow(cls);
    });
    it('returns for unexpected errors so the caller can wrap them', () => {
        expect(() => rethrowKnown(new Error('boom'))).not.toThrow();
        expect(() => rethrowKnown(undefined)).not.toThrow();
        expect(() => rethrowKnown({ code: 'P1001' })).not.toThrow();
    });
});
