import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
    QueryIntPipe,
    queryBool,
    queryInt,
    queryStringArray,
} from './query-schema';

describe('query-schema helpers', () => {
    const schema = z.object({
        page: queryInt(1).default(1),
        limit: queryInt(1, 100).default(10),
        isPublic: queryBool.optional(),
        tag: queryStringArray.optional(),
    });

    it('parses query strings into numbers, booleans and arrays', () => {
        expect(
            schema.parse({ page: '2', limit: '5', isPublic: 'false', tag: 'a' })
        ).toEqual({
            page: 2,
            limit: 5,
            isPublic: false,
            tag: ['a'],
        });
        expect(
            schema.parse({ tag: ['a', 'b'], isPublic: 'true' })
        ).toMatchObject({
            tag: ['a', 'b'],
            isPublic: true,
            page: 1,
            limit: 10,
        });
    });

    it.each([
        { page: 'abc' },
        { page: '0' },
        { limit: '1000' },
        { page: '1.5' },
        { isPublic: 'maybe' },
    ])('rejects %j', (q) => {
        expect(schema.safeParse(q).success).toBe(false);
    });

    describe('QueryIntPipe', () => {
        const pipe = new QueryIntPipe({ max: 100 });
        it('passes absent and valid values through unchanged', () => {
            expect(pipe.transform(undefined)).toBeUndefined();
            expect(pipe.transform('7')).toBe('7');
        });
        it.each(['abc', '0', '101', '1.5', '-3'])(
            'rejects %p with 400',
            (v) => {
                expect(() => pipe.transform(v)).toThrow(BadRequestException);
            }
        );
    });
});
