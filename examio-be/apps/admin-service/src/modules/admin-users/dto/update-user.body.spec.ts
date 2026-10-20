import { UpdateUserBodySchema } from './update-user.body';

describe('PATCH /admin/users/:id body', () => {
    it('accepts the profile and moderation fields', () => {
        expect(
            UpdateUserBodySchema.safeParse({
                isBanned: true,
                name: 'A',
                bio: 'b',
                isVerified: true,
            }).success
        ).toBe(true);
    });

    it.each(['isAdmin', 'isSystemAdmin', 'role'])(
        'rejects %s (admin and role changes go through the role path only)',
        (field) => {
            expect(
                UpdateUserBodySchema.safeParse({ [field]: true }).success
            ).toBe(false);
        }
    );
});
