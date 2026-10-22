import { UserEnricher } from './user-enricher.service';

const pu = (id: string) => ({ id, username: `u${id}`, name: `N${id}`, avatar: null });

function setup() {
    const auth = {
        getPublicProfiles: jest.fn(async (ids: string[]) =>
            ids.map((id) => (id.startsWith('gone') ? null : pu(id)))
        ),
    };
    return { auth, enricher: new UserEnricher(auth as never) };
}

describe('UserEnricher', () => {
    it('withUsers: N rows, ONE profile call with the distinct ids; each row gets its user', async () => {
        const { auth, enricher } = setup();
        const rows = [
            { id: 'a1', userId: '1' },
            { id: 'a2', userId: '2' },
            { id: 'a3', userId: '1' },
        ];
        const out = await enricher.withUsers(rows);
        expect(auth.getPublicProfiles).toHaveBeenCalledTimes(1);
        expect(auth.getPublicProfiles.mock.calls[0][0]).toEqual(['1', '2']);
        expect(out.map((r) => r.user?.id)).toEqual(['1', '2', '1']);
        expect(rows[0]).not.toHaveProperty('user');
    });

    it('unknown / unavailable users become user: null instead of dropping the row', async () => {
        const { enricher } = setup();
        const out = await enricher.withUsers([{ userId: 'gone-1' }, { userId: '2' }]);
        expect(out[0].user).toBeNull();
        expect(out[1].user?.id).toBe('2');
    });

    it('withUsers on an empty list makes no call', async () => {
        const { auth, enricher } = setup();
        await expect(enricher.withUsers([])).resolves.toEqual([]);
        expect(auth.getPublicProfiles).not.toHaveBeenCalled();
    });

    it('withHost / withHosts attach `host` by hostId', async () => {
        const { auth, enricher } = setup();
        const one = await enricher.withHost({ id: 'r', hostId: '9' });
        expect(one.host?.id).toBe('9');
        const many = await enricher.withHosts([{ hostId: '1' }, { hostId: '2' }, { hostId: '1' }]);
        expect(many.map((r) => r.host?.id)).toEqual(['1', '2', '1']);
        expect(auth.getPublicProfiles).toHaveBeenCalledTimes(2);
    });

    it('withRoomHost / withRoomHosts enrich examRoom.host through the session', async () => {
        const { auth, enricher } = setup();
        const s = await enricher.withRoomHost({ id: 's', examRoom: { id: 'r', hostId: '7' } });
        expect(s.examRoom.host?.id).toBe('7');
        const list = await enricher.withRoomHosts([
            { examRoom: { hostId: '1' } },
            { examRoom: { hostId: '2' } },
        ]);
        expect(list.map((x) => x.examRoom.host?.id)).toEqual(['1', '2']);
        expect(auth.getPublicProfiles).toHaveBeenCalledTimes(2);
    });

    it('profileMap returns a map of the known ids only', async () => {
        const { enricher } = setup();
        const m = await enricher.profileMap(['1', 'gone-2', null, undefined, '1']);
        expect([...m.keys()]).toEqual(['1']);
    });
});
