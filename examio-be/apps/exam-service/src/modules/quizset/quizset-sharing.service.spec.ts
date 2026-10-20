import { NotFoundException } from '@nestjs/common';
import { QuizsetSharingService } from './quizset-sharing.service';
import * as util from '../common/sharing-list.util';

jest.mock('../common/sharing-list.util', () => ({
    ...jest.requireActual('../common/sharing-list.util'),
    applySharingUpdate: jest.fn(),
}));

const user = { id: 'owner' } as never;
const people = [
    { id: 'u1', username: 'one', name: 'One', avatar: null },
    { id: 'u2', username: 'two', name: null, avatar: 'a.png' },
];

function build(set: Record<string, unknown> | null = null) {
    const prisma = {
        quizSet: {
            findFirst: jest.fn().mockResolvedValue(set),
            updateMany: jest.fn().mockResolvedValue({ count: set ? 1 : 0 }),
        },
        user: {
            findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
                people.filter((p) => where.id.in.includes(p.id))
            ),
        },
    };
    const repo = { invalidateItemCache: jest.fn().mockResolvedValue(undefined) };
    const service = new QuizsetSharingService(prisma as never, repo as never);
    return { service, prisma, repo };
}

const set = {
    isPublic: false,
    accessCode: '123456',
    whitelist: ['u1'],
    codeGrantedIds: ['u2'],
};

describe('QuizsetSharingService', () => {
    beforeEach(() => jest.clearAllMocks());

    it('GET: non-owner (or missing) is a 404 and nothing else is queried', async () => {
        const { service, prisma } = build(null);
        await expect(service.getSharing('s', user)).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.quizSet.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 's', userId: 'owner' } })
        );
        expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('GET: one batch lookup for both lists, people without email', async () => {
        const { service, prisma } = build(set);
        const view = await service.getSharing('s', user);
        expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.user.findMany).toHaveBeenCalledWith({
            where: { id: { in: ['u1', 'u2'] } },
            select: { id: true, username: true, name: true, avatar: true },
        });
        expect(view).toEqual({
            isPublic: false,
            accessCode: '123456',
            whitelist: [people[0]],
            codeGranted: [people[1]],
        });
        expect(JSON.stringify(view)).not.toMatch(/email/);
    });

    it('PUT: maps the delta to one atomic update (codeEnabled -> codeMode) and returns the GET shape', async () => {
        (util.applySharingUpdate as jest.Mock).mockResolvedValue(set);
        const { service, repo } = build(set);
        const view = await service.updateSharing('s', user, {
            addUserIds: ['u1'],
            removeUserIds: ['u3'],
            isPublic: true,
            codeEnabled: false,
        });
        expect(util.applySharingUpdate).toHaveBeenCalledWith(
            expect.anything(),
            'QuizSet',
            expect.objectContaining({
                id: 's',
                ownerId: 'owner',
                add: ['u1'],
                remove: ['u3'],
                isPublic: true,
                codeMode: 'disable',
            })
        );
        expect(repo.invalidateItemCache).toHaveBeenCalledWith('owner', 's');
        expect(view.whitelist).toEqual([people[0]]);
    });

    it('PUT: an omitted codeEnabled keeps the code; true enables it', async () => {
        (util.applySharingUpdate as jest.Mock).mockResolvedValue(set);
        const { service } = build(set);
        await service.updateSharing('s', user, { isPublic: false });
        await service.updateSharing('s', user, { codeEnabled: true });
        const modes = (util.applySharingUpdate as jest.Mock).mock.calls.map((c) => c[2].codeMode);
        expect(modes).toEqual(['keep', 'enable']);
    });

    it('generate-code: new 6-digit code, rotation clears codeGrantedIds only (whitelist untouched)', async () => {
        const { service, prisma } = build(set);
        const { accessCode } = await service.generateCode('s', user);
        expect(accessCode).toMatch(/^\d{6}$/);
        const call = prisma.quizSet.updateMany.mock.calls[0][0];
        expect(call.where).toEqual({ id: 's', userId: 'owner' });
        expect(call.data).toEqual({ accessCode, codeGrantedIds: [] });
        expect(call.data).not.toHaveProperty('whitelist');
    });

    it('generate-code: non-owner is a 404', async () => {
        const { service } = build(null);
        await expect(service.generateCode('s', user)).rejects.toBeInstanceOf(NotFoundException);
    });
});
