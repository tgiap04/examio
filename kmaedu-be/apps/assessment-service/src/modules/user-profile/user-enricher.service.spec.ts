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

describe('UserEnricher (assessment)', () => {
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
});
