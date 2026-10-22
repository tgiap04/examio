import { existingUserIds, prepareSharingUpdate, toSharingView } from './sharing-view.util';

const person = (id: string) => ({ id, username: `u${id}`, name: null, avatar: null });

/** A directory double: knows only `known`, records the ids it was asked about. */
function directory(known: string[]) {
    const profileMap = jest.fn(async (ids: string[]) => {
        return new Map(ids.filter((i) => known.includes(i)).map((i) => [i, person(i)] as const));
    });
    return { profileMap };
}

describe('toSharingView', () => {
    it('ONE directory lookup for both lists, deduplicated', async () => {
        const dir = directory(['1', '2']);
        await toSharingView(dir, {
            isPublic: false, accessCode: '123456', whitelist: ['1', '2'], codeGrantedIds: ['2', '1'],
        });
        expect(dir.profileMap).toHaveBeenCalledTimes(1);
        expect(dir.profileMap.mock.calls[0][0]).toEqual(['1', '2']);
    });

    it('keeps list order, drops ids with no account, and exposes only the public fields', async () => {
        const dir = {
            profileMap: jest.fn(async () =>
                new Map([['2', person('2')], ['1', { ...person('1'), email: 'a@b.test' } as never]])
            ),
        };
        const view = await toSharingView(dir, {
            isPublic: true, accessCode: null, whitelist: ['1', 'gone', '2'], codeGrantedIds: ['2'],
        });
        expect(view.whitelist.map((p) => p.id)).toEqual(['1', '2']);
        expect(view.codeGranted.map((p) => p.id)).toEqual(['2']);
        expect(Object.keys(view.whitelist[0]).sort()).toEqual(['avatar', 'id', 'name', 'username']);
        expect(view).toMatchObject({ isPublic: true, accessCode: null });
    });

    it('empty lists make no lookup at all', async () => {
        const dir = directory([]);
        const view = await toSharingView(dir, {
            isPublic: false, accessCode: null, whitelist: [], codeGrantedIds: [],
        });
        expect(dir.profileMap).not.toHaveBeenCalled();
        expect(view).toEqual({ isPublic: false, accessCode: null, whitelist: [], codeGranted: [] });
    });
});

describe('existingUserIds / prepareSharingUpdate', () => {
    it('only ids auth knows are kept, asked STRICTLY (an auth outage must not read as "nobody exists"); empty input skips the lookup', async () => {
        const dir = directory(['a']);
        await expect(existingUserIds(dir, [])).resolves.toEqual([]);
        expect(dir.profileMap).not.toHaveBeenCalled();
        await expect(existingUserIds(dir, ['a', 'b'])).resolves.toEqual(['a']);
        expect(dir.profileMap).toHaveBeenCalledWith(['a', 'b'], undefined, { strict: true });
    });

    it.each([
        [{ codeEnabled: true }, 'enable'],
        [{ codeEnabled: false }, 'disable'],
        [{ isPublic: true }, 'keep'],
    ])('maps %j to codeMode %s; the owner is never added to their own whitelist', async (dto, mode) => {
        const input = await prepareSharingUpdate(
            directory(['owner', 'a']), 's', 'owner',
            { ...dto, addUserIds: ['owner', 'a'], removeUserIds: ['z'] }, '654321'
        );
        expect(input).toMatchObject({ id: 's', ownerId: 'owner', add: ['a'], remove: ['z'], codeMode: mode, newCode: '654321' });
    });
});
