import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import type { Permission } from '@kmaedu/auth-jwt';
import { matchRoute } from './route-matcher';
import {
    compileDefaultLimit,
    compileRateLimits,
    findRateLimit,
    fullMatch,
    type CompiledRateLimit,
} from './rate-limit-table';
import {
    SELF_UPSTREAM,
    parseDurationMs,
    parseSizeBytes,
    routeFileSchema,
    type AuthMode,
    type RouteConfig,
} from './route-config.schema';

export const DEFAULT_TIMEOUT_MS = 30_000;

export interface CompiledRoute {
    id: string;
    upstream: string;
    /** Upstream base URL; undefined for routes the gateway serves itself. */
    target: string | undefined;
    prefix: string | undefined;
    pathRegex: RegExp | undefined;
    methods: ReadonlySet<string> | undefined;
    auth: AuthMode;
    permissions: readonly Permission[];
    publicRules: readonly { method: string; regex: RegExp }[];
    pageFlag: string | undefined;
    timeoutMs: number;
    maxBodyBytes: number | undefined;
    websocket: boolean;
    pathRewrite: { from: RegExp; to: string } | undefined;
}

const ENV_REF = /\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g;

/** `${VAR}` is required; `${VAR:-default}` falls back. */
export function interpolateEnv(value: string, env: NodeJS.ProcessEnv): string {
    return value.replace(ENV_REF, (_m, name: string, fallback?: string) => {
        const resolved = env[name] || fallback;
        if (resolved === undefined || resolved === '') {
            throw new Error(`routes.yaml: environment variable ${name} is required`);
        }
        return resolved;
    });
}

function compileRoute(route: RouteConfig, upstreams: Record<string, string>): CompiledRoute {
    const self = route.upstream === SELF_UPSTREAM;
    return {
        id: route.id,
        upstream: route.upstream,
        target: self ? undefined : upstreams[route.upstream],
        prefix: 'prefix' in route.match ? route.match.prefix : undefined,
        pathRegex: 'path' in route.match ? fullMatch(route.match.path) : undefined,
        methods: route.methods ? new Set(route.methods) : undefined,
        auth: route.auth,
        permissions: route.permissions ?? [],
        publicRules: (route.public ?? []).map((p) => ({
            method: p.method,
            regex: fullMatch(p.path),
        })),
        pageFlag: route.pageFlag,
        timeoutMs: route.timeout === undefined ? DEFAULT_TIMEOUT_MS : parseDurationMs(route.timeout),
        maxBodyBytes: route.maxBodySize ? parseSizeBytes(route.maxBodySize) : undefined,
        websocket: route.websocket === true,
        pathRewrite: route.pathRewrite
            ? { from: new RegExp(route.pathRewrite.from), to: route.pathRewrite.to }
            : undefined,
    };
}

export class RouteTable {
    constructor(
        readonly routes: readonly CompiledRoute[],
        private readonly limits: readonly CompiledRateLimit[],
        private readonly fallbackLimit: CompiledRateLimit
    ) {}

    match(method: string, pathname: string): CompiledRoute | undefined {
        return matchRoute(this.routes, method, pathname);
    }

    rateLimitFor(method: string, pathname: string): CompiledRateLimit {
        return findRateLimit(this.limits, this.fallbackLimit, method, pathname);
    }

    /** A `public` exception turns a required route into an optional one for that request. */
    effectiveAuth(route: CompiledRoute, method: string, pathname: string): AuthMode {
        if (
            route.auth === 'required' &&
            route.publicRules.some((r) => r.method === method && r.regex.test(pathname))
        ) {
            return 'optional';
        }
        return route.auth;
    }
}

export function compileRouteTable(raw: unknown, env: NodeJS.ProcessEnv): RouteTable {
    const file = routeFileSchema.parse(raw);
    const upstreams = Object.fromEntries(
        Object.entries(file.upstreams).map(([name, url]) => [name, interpolateEnv(url, env)])
    );
    return new RouteTable(
        file.routes.map((r) => compileRoute(r, upstreams)),
        compileRateLimits(file.rateLimits),
        compileDefaultLimit(file.defaultRateLimit)
    );
}

/** `ROUTES_CONFIG_PATH`, else `config/routes.yaml` next to the bundle, else the source tree. */
export function resolveRoutesPath(env: NodeJS.ProcessEnv = process.env): string {
    if (env.ROUTES_CONFIG_PATH) return env.ROUTES_CONFIG_PATH;
    const candidates = [
        join(__dirname, 'config', 'routes.yaml'),
        join(__dirname, '..', '..', 'config', 'routes.yaml'),
    ];
    const found = candidates.find((p) => existsSync(p));
    if (!found) throw new Error(`routes.yaml not found (looked in ${candidates.join(', ')})`);
    return found;
}

export function loadRouteTable(
    options: { file?: string; env?: NodeJS.ProcessEnv } = {}
): RouteTable {
    const env = options.env ?? process.env;
    const path = options.file ?? resolveRoutesPath(env);
    return compileRouteTable(parse(readFileSync(path, 'utf8')), env);
}
