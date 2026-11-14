import { UserEnricher } from './user-enricher.service';

const pu = (id: string) => ({ id, username: `u${id}`, name: `N${id}`, avatar: null });

describe('UserEnricher (content)', () => {
    it('enriches owners through one batched public-profile lookup (no email)', async () => {
        const auth = {
            getPublicProfiles: jest.fn(async (ids: string[]) =>
                ids.map((id) => (id.startsWith('gone') ? null : pu(id)))
            ),
        };
        const enricher = new UserEnricher(auth as never);
        const rows = await enricher.withUsers([{ userId: '1' }, { userId: '2' }, { userId: 'gone' }]);
        expect(rows.map((row) => (row as { user: { id: string } | null }).user?.id ?? null)).toEqual(['1', '2', null]);
        expect(auth.getPublicProfiles).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(rows)).not.toContain('email');
    });
});
