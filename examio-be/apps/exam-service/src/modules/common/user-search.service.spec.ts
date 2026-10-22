import { BadRequestException } from '@nestjs/common';
import { buildMetadata } from '@examio/grpc';
import {
    SearchQueryPipe,
    USER_SEARCH_LIMIT,
    UserSearchService,
} from './user-search.service';

const person = (id: string) => ({ id, username: `u${id}`, name: null, avatar: null });

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

    describe('UserSearchService (auth owns the matching rules)', () => {
        const searchUsers = jest.fn();
        const service = new UserSearchService({ searchUsers } as never);
        const md = buildMetadata({ authorization: 'Bearer user-token' });
        beforeEach(() => searchUsers.mockReset().mockResolvedValue([]));

        it('delegates to auth SearchUsers with the trimmed query and the caller token', async () => {
            await service.search(' Bob ', 'me', md);
            expect(searchUsers).toHaveBeenCalledWith('Bob', 20, md);
        });

        it('drops the caller and caps the picker at 10', async () => {
            searchUsers.mockResolvedValue([
                person('me'),
                ...Array.from({ length: 15 }, (_, i) => person(`p${i}`)),
            ]);
            const out = await service.search('abc', 'me', md);
            expect(out).toHaveLength(USER_SEARCH_LIMIT);
            expect(out.map((p) => p.id)).not.toContain('me');
        });

        it('never returns more than the four public fields', async () => {
            searchUsers.mockResolvedValue([{ ...person('a'), email: 'a@b.test' }]);
            const [p] = await service.search('abc', 'me', md);
            expect(Object.keys(p).sort()).toEqual(['avatar', 'id', 'name', 'username']);
        });

        it('does not even call auth for a short term', async () => {
            expect(await service.search('ab', 'me', md)).toEqual([]);
            expect(searchUsers).not.toHaveBeenCalled();
        });
    });
});
