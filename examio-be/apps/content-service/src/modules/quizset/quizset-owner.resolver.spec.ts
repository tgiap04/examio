import { QuizSetOwnerResolver } from './quizset-owner.resolver';

function build(row: { userId: string } | null) {
    const findUnique = jest.fn().mockResolvedValue(row);
    return { resolver: new QuizSetOwnerResolver({ quizSet: { findUnique } } as never), findUnique };
}

describe('QuizSetOwnerResolver', () => {
    it('owner id from :id, :quizSetId or body.quizSetId (params win), one narrow select', async () => {
        const { resolver, findUnique } = build({ userId: 'owner' });
        await expect(resolver.resolveOwnerId({ params: { id: 'a' } })).resolves.toBe('owner');
        await expect(resolver.resolveOwnerId({ params: { quizSetId: 'b' } })).resolves.toBe('owner');
        await expect(resolver.resolveOwnerId({ body: { quizSetId: 'c' } })).resolves.toBe('owner');
        await expect(resolver.resolveOwnerId({ params: { id: 'a' }, body: { quizSetId: 'c' } })).resolves.toBe('owner');
        expect(findUnique.mock.calls.map((c) => c[0].where.id)).toEqual(['a', 'b', 'c', 'a']);
        expect(findUnique).toHaveBeenCalledWith({ where: { id: 'a' }, select: { userId: true } });
    });

    it('a missing set is null (the guard then refuses a non-permitted caller)', async () => {
        const { resolver } = build(null);
        await expect(resolver.resolveOwnerId({ params: { id: 'x' } })).resolves.toBeNull();
    });

    it('no id anywhere, or a non-string body id: null without touching the database', async () => {
        const { resolver, findUnique } = build({ userId: 'owner' });
        await expect(resolver.resolveOwnerId({})).resolves.toBeNull();
        await expect(resolver.resolveOwnerId({ body: { quizSetId: 42 } })).resolves.toBeNull();
        await expect(resolver.resolveOwnerId({ body: undefined, params: {} })).resolves.toBeNull();
        expect(findUnique).not.toHaveBeenCalled();
    });
});
