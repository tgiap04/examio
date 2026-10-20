import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import {
    SearchQueryPipe,
    USER_SEARCH_LIMIT,
    UserSearchService,
} from './user-search.service';

describe('user search (gap 5)', () => {
    describe('SearchQueryPipe', () => {
        const pipe = new SearchQueryPipe();
        it.each([undefined, '', 'ab', '  a ', 5, ['abc']])(
            'rejects %p with 400',
            (v) => {
                expect(() => pipe.transform(v)).toThrow(BadRequestException);
            }
        );
        it('trims and accepts 3+ characters', () => {
            expect(pipe.transform('  abc ')).toBe('abc');
        });
    });

    describe('UserSearchService', () => {
        const findMany = jest.fn().mockResolvedValue([]);
        const service = new UserSearchService({
            user: { findMany },
        } as unknown as PrismaService);
        beforeEach(() => findMany.mockClear());

        it('matches username/name by prefix and email EXACTLY, never "contains"', async () => {
            await service.search('Bob', 'me');
            const args = findMany.mock.calls[0][0];
            expect(args.where.OR).toEqual([
                { username: { startsWith: 'Bob', mode: 'insensitive' } },
                { name: { startsWith: 'Bob', mode: 'insensitive' } },
                { email: { equals: 'Bob', mode: 'insensitive' } },
            ]);
            expect(JSON.stringify(args)).not.toContain('contains');
        });

        it('excludes the caller and deleted users, selects no email, caps at 10', async () => {
            await service.search('abc', 'me');
            const args = findMany.mock.calls[0][0];
            expect(args.where.id).toEqual({ not: 'me' });
            expect(args.where.deletedAt).toBeNull();
            expect(args.select).toEqual({
                id: true,
                username: true,
                name: true,
                avatar: true,
            });
            expect(args.take).toBe(USER_SEARCH_LIMIT);
        });

        it('does not even query for a short term', async () => {
            expect(await service.search('ab', 'me')).toEqual([]);
            expect(findMany).not.toHaveBeenCalled();
        });
    });
});
