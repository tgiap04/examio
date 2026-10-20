import { existingUserIds, prepareSharingUpdate, toSharingView } from './sharing-view.util';

const person = (id: string) => ({ id, username: `u${id}`, name: null, avatar: null });

describe('toSharingView', () => {
    const rich = { ...person('1'), email: 'a@b.test', password: 'x', phone: '1' };

    it('one batch lookup for both lists, deduplicated, selecting only the four public fields', async () => {
        const findMany = jest.fn().mockResolvedValue([rich, person('2')]);
        await toSharingView({ user: { findMany } } as never, {
            isPublic: false, accessCode: '123456', whitelist: ['1', '2'], codeGrantedIds: ['2', '1'],
        });
        expect(findMany).toHaveBeenCalledTimes(1);
        expect(findMany).toHaveBeenCalledWith({
            where: { id: { in: ['1', '2'] } },
            select: { id: true, username: true, name: true, avatar: true },
        });
    });

    it('keeps list order, drops ids with no account, and never exposes more than the query returned', async () => {
        const findMany = jest.fn().mockResolvedValue([person('2'), person('1')]);
        const view = await toSharingView({ user: { findMany } } as never, {
            isPublic: true, accessCode: null, whitelist: ['1', 'gone', '2'], codeGrantedIds: ['2'],
        });
        expect(view.whitelist.map((p) => p.id)).toEqual(['1', '2']);
        expect(view.codeGranted.map((p) => p.id)).toEqual(['2']);
        expect(view).toMatchObject({ isPublic: true, accessCode: null });
    });

    it('empty lists make no query at all', async () => {
        const findMany = jest.fn();
        const view = await toSharingView({ user: { findMany } } as never, {
            isPublic: false, accessCode: null, whitelist: [], codeGrantedIds: [],
        });
        expect(findMany).not.toHaveBeenCalled();
        expect(view).toEqual({ isPublic: false, accessCode: null, whitelist: [], codeGranted: [] });
    });
});

describe('existingUserIds / prepareSharingUpdate', () => {
    it('only live accounts (deletedAt null) are kept; empty input skips the query', async () => {
        const findMany = jest.fn().mockResolvedValue([{ id: 'a' }]);
        const prisma = { user: { findMany } } as never;
        await expect(existingUserIds(prisma, [])).resolves.toEqual([]);
        expect(findMany).not.toHaveBeenCalled();
        await expect(existingUserIds(prisma, ['a', 'b'])).resolves.toEqual(['a']);
        expect(findMany).toHaveBeenCalledWith({
            where: { id: { in: ['a', 'b'] }, deletedAt: null },
            select: { id: true },
        });
    });

    it.each([
        [{ codeEnabled: true }, 'enable'],
        [{ codeEnabled: false }, 'disable'],
        [{ isPublic: true }, 'keep'],
    ])('maps %j to codeMode %s; the owner is never added to their own whitelist', async (dto, mode) => {
        const findMany = jest.fn().mockResolvedValue([{ id: 'owner' }, { id: 'a' }]);
        const input = await prepareSharingUpdate(
            { user: { findMany } } as never, 's', 'owner',
            { ...dto, addUserIds: ['owner', 'a'], removeUserIds: ['z'] }, '654321'
        );
        expect(input).toMatchObject({ id: 's', ownerId: 'owner', add: ['a'], remove: ['z'], codeMode: mode, newCode: '654321' });
    });
});
