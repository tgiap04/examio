import {
    SignJWT,
    exportJWK,
    generateKeyPair,
    type JWK,
    type KeyLike,
} from 'jose';

/** Test-only helpers (never imported by production code or the barrel). */
export interface TestKeyPair {
    kid: string;
    privateKey: KeyLike;
    publicJwk: JWK;
}

export async function createTestKeyPair(kid = 'test-kid-1'): Promise<TestKeyPair> {
    const { publicKey, privateKey } = await generateKeyPair('RS256', {
        extractable: true,
    });
    const publicJwk = await exportJWK(publicKey);
    return {
        kid,
        privateKey,
        publicJwk: { ...publicJwk, kid, use: 'sig', alg: 'RS256' },
    };
}

export interface TestTokenOptions {
    claims?: Record<string, unknown>;
    issuer?: string;
    audience?: string | string[];
    /** Seconds from now; negative for an already-expired token. */
    expiresInSeconds?: number;
    typ?: string;
    omitKid?: boolean;
}

export const TEST_ISSUER = 'examio-auth';
export const TEST_AUDIENCE = 'examio';

export function signTestToken(
    keys: TestKeyPair,
    options: TestTokenOptions = {}
): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const jwt = new SignJWT({
        sid: 'sid-1',
        roles: ['STUDENT'],
        email_verified: true,
        av: 0,
        ...options.claims,
    })
        .setProtectedHeader({
            alg: 'RS256',
            typ: options.typ ?? 'at+jwt',
            ...(options.omitKid ? {} : { kid: keys.kid }),
        })
        .setIssuer(options.issuer ?? TEST_ISSUER)
        .setAudience(options.audience ?? TEST_AUDIENCE)
        .setIssuedAt(now - 1)
        .setExpirationTime(now + (options.expiresInSeconds ?? 900));
    if (!options.claims || !('sub' in options.claims)) jwt.setSubject('user-1');
    return jwt.sign(keys.privateKey);
}

export function userClaims(
    overrides: Record<string, unknown> = {}
): Record<string, unknown> {
    return { sub: 'user-1', ...overrides };
}

export function serviceClaims(name: string): Record<string, unknown> {
    return {
        sub: `svc:${name}`,
        roles: ['SERVICE'],
        sid: undefined,
        av: undefined,
        email_verified: undefined,
    };
}

// ---------------------------------------------------------------------------
// Declaration scan (deny-by-default safety net): walks a root module's static
// metadata and lists every HTTP/RPC handler that carries no authz declaration.
// ---------------------------------------------------------------------------
import 'reflect-metadata';
import type { DynamicModule, Type } from '@nestjs/common';
import { declarationOf } from './decorators';

type ModuleRef = Type<unknown> | DynamicModule | Promise<DynamicModule> | undefined;

function moduleMeta(ref: Type<unknown> | DynamicModule): {
    target: Type<unknown>;
    imports: ModuleRef[];
    controllers: Type<unknown>[];
} {
    const dynamic = (ref as DynamicModule).module !== undefined;
    const target = dynamic ? (ref as DynamicModule).module : (ref as Type<unknown>);
    const extra = dynamic ? (ref as DynamicModule) : undefined;
    return {
        target,
        imports: [
            ...((Reflect.getMetadata('imports', target) as ModuleRef[]) ?? []),
            ...((extra?.imports as ModuleRef[]) ?? []),
        ],
        controllers: [
            ...((Reflect.getMetadata('controllers', target) as Type<unknown>[]) ?? []),
            ...((extra?.controllers as Type<unknown>[]) ?? []),
        ],
    };
}

export function collectControllers(root: Type<unknown>): Type<unknown>[] {
    const seen = new Set<unknown>();
    const controllers = new Set<Type<unknown>>();
    const walk = (ref: ModuleRef): void => {
        if (!ref || ref instanceof Promise) return;
        const { target, imports, controllers: own } = moduleMeta(ref);
        if (seen.has(target) && !(ref as DynamicModule).module) return;
        seen.add(target);
        own.forEach((c) => controllers.add(c));
        imports.forEach(walk);
    };
    walk(root);
    return [...controllers];
}

const HTTP_METHOD_KEY = 'method';
const RPC_PATTERN_KEY = 'microservices:pattern';

export interface HandlerRef {
    controller: string;
    handler: string;
    kind: 'http' | 'rpc';
}

export function routeHandlers(controller: Type<unknown>): HandlerRef[] {
    const proto = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(proto).flatMap((name) => {
        const fn = proto[name];
        if (name === 'constructor' || typeof fn !== 'function') return [];
        const kind = Reflect.hasMetadata(HTTP_METHOD_KEY, fn)
            ? 'http'
            : Reflect.hasMetadata(RPC_PATTERN_KEY, fn)
              ? 'rpc'
              : undefined;
        return kind ? [{ controller: controller.name, handler: name, kind } as HandlerRef] : [];
    });
}

/** `Controller.handler` of every route without a declaration (handler or class level). */
export function undeclaredHandlers(controllers: Type<unknown>[]): string[] {
    return controllers.flatMap((controller) =>
        routeHandlers(controller)
            .filter(({ handler }) => {
                const fn = (controller.prototype as Record<string, object>)[handler];
                return ![fn, controller].some((target) =>
                    declarationOf(<T>(key: string) => Reflect.getMetadata(key, target) as T | undefined)
                );
            })
            .map(({ controller: c, handler }) => `${c}.${handler}`)
    );
}
