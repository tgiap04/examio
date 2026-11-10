import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import {
    ALLOW_UNVERIFIED_KEY,
    declarationOf,
    type Declaration,
} from './decorators';

/** Handler-level declaration wins over class-level; undefined = nothing declared. */
export function resolveDeclaration(
    reflector: Reflector,
    context: ExecutionContext
): Declaration | undefined {
    for (const target of [context.getHandler(), context.getClass()]) {
        const declaration = declarationOf(<T>(key: string) =>
            reflector.get<T>(key, target)
        );
        if (declaration) return declaration;
    }
    return undefined;
}

export function allowsUnverified(
    reflector: Reflector,
    context: ExecutionContext
): boolean {
    return (
        reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, [
            context.getHandler(),
            context.getClass(),
        ]) === true
    );
}
