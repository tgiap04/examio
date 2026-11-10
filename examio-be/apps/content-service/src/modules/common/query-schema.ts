import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/** Query-string building blocks for Zod DTOs (every query value arrives as a string). */

/** `?page=2` -> 2; garbage -> 400. */
export const queryInt = (min: number, max?: number) => {
    const base = z.coerce.number().int().min(min);
    return max === undefined ? base : base.max(max);
};

/** `?isPublic=true|false` -> boolean (anything else -> 400). */
export const queryBool = z.preprocess(
    (v) => (v === 'true' ? true : v === 'false' ? false : v),
    z.boolean()
);

/** `?tag=a&tag=b` -> ['a','b']; `?tag=a` -> ['a']. */
export const queryStringArray = z.preprocess(
    (v) => (v === undefined ? v : Array.isArray(v) ? v : [v]),
    z.array(z.string())
);

/**
 * Validates a single integer query parameter (`?page=abc` -> 400) and passes
 * the original value through, so handlers that already `Number()` it keep
 * working. Absent or empty values are left to the handler's default.
 */
export class QueryIntPipe implements PipeTransform<unknown, unknown> {
    constructor(private readonly opts: { min?: number; max?: number } = {}) {}

    transform(value: unknown): unknown {
        if (value === undefined || value === '') return value;
        const n = Number(value);
        const { min = 1, max = 1000 } = this.opts;
        if (!Number.isInteger(n) || n < min || n > max) {
            throw new BadRequestException({
                statusCode: 400,
                code: 'INVALID_QUERY',
                message: `query value must be an integer between ${min} and ${max}`,
            });
        }
        return value;
    }
}
