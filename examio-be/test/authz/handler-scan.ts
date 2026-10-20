import 'reflect-metadata';
import type { DynamicModule, Type } from '@nestjs/common';
import {
    OWNER_OR_PERMISSION_KEY,
    declarationOf,
    type Declaration,
} from '@examio/auth-jwt';

/** Static (no DI boot) scan of a service's module graph for authz declarations. */
type ModuleRef =
    | Type<unknown>
    | DynamicModule
    | Promise<DynamicModule>
    | undefined;
type Provider =
    | Type<unknown>
    | { provide?: unknown; useClass?: Type<unknown> }
    | unknown;

const METHOD_NAMES = [
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'PATCH',
    'ALL',
    'OPTIONS',
    'HEAD',
    'SEARCH',
];

export interface HttpHandler {
    key: string;
    controller: string;
    handler: string;
    method: string;
    route: string;
    declaration: Declaration | undefined;
    /** true when the declaration came from `@RequireOwnerOrPermission`. */
    ownerOrPermission: boolean;
}

export interface WsGateway {
    name: string;
    classDeclaration: Declaration | undefined;
    messages: string[];
}

export interface ServiceScan {
    http: HttpHandler[];
    gateways: WsGateway[];
}

function moduleParts(ref: Type<unknown> | DynamicModule) {
    const dynamic = (ref as DynamicModule).module !== undefined;
    const target = dynamic
        ? (ref as DynamicModule).module
        : (ref as Type<unknown>);
    const extra = dynamic ? (ref as DynamicModule) : undefined;
    const meta = <T>(key: string): T[] =>
        (Reflect.getMetadata(key, target) as T[] | undefined) ?? [];
    return {
        target,
        imports: [
            ...meta<ModuleRef>('imports'),
            ...((extra?.imports as ModuleRef[]) ?? []),
        ],
        controllers: [
            ...meta<Type<unknown>>('controllers'),
            ...((extra?.controllers as Type<unknown>[]) ?? []),
        ],
        providers: [
            ...meta<Provider>('providers'),
            ...((extra?.providers as Provider[]) ?? []),
        ],
    };
}

const providerClass = (p: Provider): Type<unknown> | undefined => {
    if (typeof p === 'function') return p as Type<unknown>;
    const useClass = (p as { useClass?: Type<unknown> } | null)?.useClass;
    return typeof useClass === 'function' ? useClass : undefined;
};

const declarationFor = (target: object): Declaration | undefined =>
    declarationOf(
        <T>(key: string) => Reflect.getMetadata(key, target) as T | undefined
    );

function pathOf(value: unknown): string {
    const v = Array.isArray(value) ? value[0] : value;
    return typeof v === 'string' ? v : '';
}

function httpHandlers(controller: Type<unknown>): HttpHandler[] {
    const proto = controller.prototype as Record<string, unknown>;
    const base = pathOf(Reflect.getMetadata('path', controller));
    return Object.getOwnPropertyNames(proto).flatMap((name) => {
        const fn = proto[name];
        if (name === 'constructor' || typeof fn !== 'function') return [];
        if (!Reflect.hasMetadata('method', fn)) return [];
        const method =
            METHOD_NAMES[Reflect.getMetadata('method', fn) as number] ??
            'UNKNOWN';
        const route = `/${[base, pathOf(Reflect.getMetadata('path', fn))].filter(Boolean).join('/')}`;
        return [
            {
                key: `${controller.name}.${name}`,
                controller: controller.name,
                handler: name,
                method,
                route,
                declaration: declarationFor(fn) ?? declarationFor(controller),
                ownerOrPermission: Reflect.hasMetadata(
                    OWNER_OR_PERMISSION_KEY,
                    fn
                ),
            },
        ];
    });
}

function gatewayOf(cls: Type<unknown>): WsGateway | undefined {
    if (!Reflect.getMetadata('websockets:is_gateway', cls)) return undefined;
    const proto = cls.prototype as Record<string, unknown>;
    const messages = Object.getOwnPropertyNames(proto).filter((name) => {
        const fn = proto[name];
        return (
            typeof fn === 'function' &&
            Reflect.getMetadata('websockets:message_mapping', fn) === true
        );
    });
    return { name: cls.name, classDeclaration: declarationFor(cls), messages };
}

export function scanService(root: Type<unknown>): ServiceScan {
    const seen = new Set<unknown>();
    const controllers = new Set<Type<unknown>>();
    const gateways = new Map<string, WsGateway>();
    const walk = (ref: ModuleRef): void => {
        if (!ref || ref instanceof Promise) return;
        const {
            target,
            imports,
            controllers: own,
            providers,
        } = moduleParts(ref);
        if (seen.has(target) && !(ref as DynamicModule).module) return;
        seen.add(target);
        own.forEach((c) => controllers.add(c));
        for (const p of providers) {
            const cls = providerClass(p);
            const gw = cls ? gatewayOf(cls) : undefined;
            if (gw) gateways.set(gw.name, gw);
        }
        imports.forEach(walk);
    };
    walk(root);
    return {
        http: [...controllers].flatMap(httpHandlers),
        gateways: [...gateways.values()],
    };
}
