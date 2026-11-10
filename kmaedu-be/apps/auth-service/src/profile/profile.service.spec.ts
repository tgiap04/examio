import { ProfileService } from './profile.service';

function setup() {
    const r2 = {
        uploadFile: jest.fn(async () => ({ success: true, url: 'https://cdn.kmaedu.test/x' })),
    };
    const writer = { update: jest.fn(async () => ({ user: {}, changed: [] })) };
    const service = new ProfileService(
        {} as never,
        { generateId: () => 'rand' } as never,
        r2 as never,
        writer as never
    );
    return { service, r2, writer };
}

const file = (size = 10) =>
    ({ mimetype: 'image/png', size, originalname: 'Me.png', buffer: Buffer.from('x') }) as never;

describe('ProfileService.uploadProfileImage owner-scoped keys', () => {
    it.each([
        ['avatar', 'avatars/u1'],
        ['banner', 'banners/u1'],
    ] as const)('uploads %s under <area>/<userId>', async (type, folder) => {
        const { service, r2 } = setup();
        await service.uploadProfileImage({ id: 'u1' }, file(), type);
        expect(r2.uploadFile).toHaveBeenCalledWith(
            expect.objectContaining({ folder, filename: 'rand-me.png' }),
            expect.anything()
        );
    });
});
