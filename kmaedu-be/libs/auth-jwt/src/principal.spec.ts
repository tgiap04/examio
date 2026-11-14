import { Metadata } from '@grpc/grpc-js';
import type { ExecutionContext } from '@nestjs/common';
import { assertSelfOrService, principalOfMetadata, setPrincipal } from './principal';
import type { Principal } from './types';

function withPrincipal(principal?: Principal): Metadata {
    const md = new Metadata();
    const ctx = { getType: () => 'rpc', switchToRpc: () => ({ getContext: () => md }) } as unknown as ExecutionContext;
    setPrincipal(ctx, principal);
    return md;
}
const user = (id: string): Principal => ({ kind: 'user', id, sid: 's', roles: ['STUDENT'], emailVerified: true, av: 0 });
const deny = { code: 7 };

describe('assertSelfOrService', () => {
    it('lets a user name itself', () => {
        expect(() => assertSelfOrService(withPrincipal(user('u1')), 'u1')).not.toThrow();
    });

    it('rejects a user naming someone else or nobody, with gRPC PERMISSION_DENIED', () => {
        for (const id of ['u2', '']) {
            try {
                assertSelfOrService(withPrincipal(user('u1')), id);
                throw new Error('should have thrown');
            } catch (err) {
                expect((err as { getError(): unknown }).getError()).toMatchObject({ ...deny, message: 'PERMISSION_DENIED' });
            }
        }
    });

    it('lets any (already allowlisted) service name any user', () => {
        expect(() => assertSelfOrService(withPrincipal({ kind: 'service', name: 'exam' }), 'whoever')).not.toThrow();
    });

    it('denies when no principal was attached (defensive)', () => {
        expect(() => assertSelfOrService(new Metadata(), 'u1')).toThrow();
        expect(() => assertSelfOrService(undefined, 'u1')).toThrow();
        expect(principalOfMetadata(new Metadata())).toBeUndefined();
    });
});
