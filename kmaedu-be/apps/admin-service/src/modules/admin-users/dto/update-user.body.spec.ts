import { UpdateUserBodySchema } from './update-user.body';

describe('PATCH /admin/users/:id body', () => {
    it('accepts the profile fields', () => {
        expect(
            UpdateUserBodySchema.safeParse({
                name: 'A',
                bio: 'b',
                isVerified: true,
            }).success
        ).toBe(true);
    });

    it.each(['isSystemAdmin', 'role', 'isBanned'])(
        'rejects %s (admin and role changes go through the role path only)',
        (field) => {
            expect(
                UpdateUserBodySchema.safeParse({ [field]: true }).success
            ).toBe(false);
        }
    );
});
