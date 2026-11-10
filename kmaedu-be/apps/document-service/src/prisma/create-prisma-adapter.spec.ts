import { createPrismaAdapter } from './create-prisma-adapter';

describe('createPrismaAdapter', () => {
    it('requires a DATABASE_URL', () => {
        expect(() => createPrismaAdapter('')).toThrow(
            'DATABASE_URL is required'
        );
    });

    it('accepts a ?schema= URL without handing the param to the pg driver', () => {
        expect(() =>
            createPrismaAdapter('postgresql://u:p@127.0.0.1:5432/kmaedu?schema=svc')
        ).not.toThrow();
    });
});
