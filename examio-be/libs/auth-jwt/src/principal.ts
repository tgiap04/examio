import {
    createParamDecorator,
    type ExecutionContext,
} from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import type { Principal } from './types';

/** RPC contexts carry the gRPC `Metadata` object, so principals are keyed on it. */
const rpcPrincipals = new WeakMap<object, Principal>();

export function setPrincipal(
    context: ExecutionContext,
    principal: Principal | undefined
): void {
    if (context.getType() === 'rpc') {
        const md = context.switchToRpc().getContext<object>();
        if (md && principal) rpcPrincipals.set(md, principal);
        return;
    }
    context.switchToHttp().getRequest<{ user?: Principal }>().user = principal;
}

export function getPrincipal(context: ExecutionContext): Principal | undefined {
    if (context.getType() === 'rpc') {
        const md = context.switchToRpc().getContext<object>();
        return md ? rpcPrincipals.get(md) : undefined;
    }
    return context.switchToHttp().getRequest<{ user?: Principal }>().user;
}

/** The principal the guard verified for an RPC call (handlers receive the call `Metadata`). */
export function principalOfMetadata(md: object | undefined): Principal | undefined {
    return md ? rpcPrincipals.get(md) : undefined;
}

/**
 * IDOR guard for RPCs that take a `user_id` in the request body while also
 * accepting user tokens: a USER principal may only name itself (`sub`); an
 * allowlisted SERVICE principal (already vetted by the declaration) may name
 * anyone. No principal at all is denied (defensive: the guards always set one).
 */
export function assertSelfOrService(
    metadata: object | undefined,
    userId: string
): void {
    const principal = principalOfMetadata(metadata);
    if (principal?.kind === 'service') return;
    if (principal?.kind === 'user' && userId && principal.id === userId) return;
    throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'PERMISSION_DENIED',
    });
}

/** `@CurrentUser()` -> `AuthUser | ServiceCaller` (undefined on `@Public` anonymous calls). */
export const CurrentUser = createParamDecorator(
    (_data: unknown, context: ExecutionContext) => getPrincipal(context)
);
