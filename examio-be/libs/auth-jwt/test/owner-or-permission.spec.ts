import 'reflect-metadata';
import {
    Controller,
    Get,
    Injectable,
    type ExecutionContext,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
    OWNER_OR_PERMISSION_KEY,
    OwnerOrPermissionGuard,
    RequireOwnerOrPermission,
    declarationOf,
    type OwnerResolver,
} from '../src';

@Injectable()
class SetResolver implements OwnerResolver {
    calls = 0;
    owners: Record<string, string> = { mine: 'u1', theirs: 'u2' };
    async resolveOwnerId(req: { params?: Record<string, string> }) {
        this.calls++;
        return this.owners[req.params?.id ?? ''] ?? null;
    }
}

@Controller('sets')
class SetController {
    @Get(':id')
    @RequireOwnerOrPermission('flashcard:study', SetResolver)
    study() {}
}

function ctx(user: unknown, id: string, type = 'http'): ExecutionContext {
    const req = { user, params: { id } };
    return {
        getType: () => type,
        getClass: () => SetController,
        getHandler: () => SetController.prototype.study,
        switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
}

const user = (roles: string[], id = 'u1') => ({
    kind: 'user' as const,
    id,
    sid: 's',
    roles,
    emailVerified: true,
    av: 0,
});

describe('@RequireOwnerOrPermission', () => {
    let guard: OwnerOrPermissionGuard;
    let resolver: SetResolver;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [SetResolver],
        }).compile();
        resolver = moduleRef.get(SetResolver);
        guard = new OwnerOrPermissionGuard(
            new Reflector(),
            moduleRef.get(ModuleRef)
        );
    });

    const outcome = async (c: ExecutionContext) => {
        try {
            return (await guard.canActivate(c)) ? 'pass' : 'deny';
        } catch (e) {
            const body = (
                e as { getResponse?: () => { code?: string } }
            ).getResponse?.();
            return `${(e as { getStatus(): number }).getStatus()} ${body?.code}`;
        }
    };

    it('declares itself as @Authenticated plus the owner-or-permission marker', () => {
        const fn = SetController.prototype.study;
        expect(Reflect.getMetadata(OWNER_OR_PERMISSION_KEY, fn)).toEqual({
            permission: 'flashcard:study',
            resolver: SetResolver,
        });
        expect(
            declarationOf(
                <T>(k: string) => Reflect.getMetadata(k, fn) as T | undefined
            )
        ).toEqual({ kind: 'authenticated' });
    });

    it('lets a holder of the permission through without resolving the owner', async () => {
        expect(await outcome(ctx(user(['STUDENT']), 'theirs'))).toBe('pass');
        expect(resolver.calls).toBe(0);
    });

    it('lets the owner through when the role lacks the permission (TEACHER previews own set)', async () => {
        expect(await outcome(ctx(user(['TEACHER']), 'mine'))).toBe('pass');
    });

    it('403 PERMISSION_DENIED for a foreign resource', async () => {
        expect(await outcome(ctx(user(['TEACHER']), 'theirs'))).toBe(
            '403 PERMISSION_DENIED'
        );
    });

    it('same 403 whether the resource is missing or foreign (no existence leak)', async () => {
        expect(await outcome(ctx(user(['TEACHER']), 'missing'))).toBe(
            '403 PERMISSION_DENIED'
        );
    });

    it('SYSTEM_ADMIN-only token owning nothing is denied', async () => {
        expect(await outcome(ctx(user(['SYSTEM_ADMIN']), 'theirs'))).toBe(
            '403 PERMISSION_DENIED'
        );
    });

    it('denies a non-user principal and a missing principal', async () => {
        expect(
            await outcome(ctx({ kind: 'service', name: 'exam' }, 'mine'))
        ).toBe('403 PERMISSION_DENIED');
        expect(await outcome(ctx(undefined, 'mine'))).toBe('401 TOKEN_MISSING');
    });

    it('fails closed when the resolver throws', async () => {
        resolver.resolveOwnerId = async () => {
            throw new Error('db down');
        };
        await expect(
            guard.canActivate(ctx(user(['TEACHER']), 'mine'))
        ).rejects.toThrow('db down');
    });

    it('skips websocket contexts like the other guards', async () => {
        expect(await outcome(ctx(undefined, 'mine', 'ws'))).toBe('pass');
    });
});
