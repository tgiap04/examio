import { z } from 'zod';
import { PERMISSIONS, type Permission } from '@kmaedu/auth-jwt';

export const SELF_UPSTREAM = 'self';

const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
const PERMISSION_VALUES = Object.values(PERMISSIONS) as [Permission, ...Permission[]];

const DURATION = /^(\d+)(ms|s|m)$/;
const SIZE = /^(\d+)(b|kb|mb|gb)$/i;
const UNIT_MS = { ms: 1, s: 1_000, m: 60_000 } as const;
const UNIT_BYTES = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 } as const;

function isValidRegex(source: string): boolean {
    try {
        new RegExp(source);
        return true;
    } catch {
        return false;
    }
}

const regexSource = z.string().min(1).refine(isValidRegex, 'invalid regular expression');
const duration = z.union([z.number().int().min(0), z.string().regex(DURATION)]);

/** `0`/`"0s"` mean "no timeout" (SSE). */
export function parseDurationMs(value: string | number): number {
    if (typeof value === 'number') return value;
    const [, amount, unit] = DURATION.exec(value)!;
    return Number(amount) * UNIT_MS[unit as keyof typeof UNIT_MS];
}

export function parseSizeBytes(value: string): number {
    const [, amount, unit] = SIZE.exec(value)!;
    return Number(amount) * UNIT_BYTES[unit.toLowerCase() as keyof typeof UNIT_BYTES];
}

const match = z.union([
    z.object({ prefix: z.string().regex(/^\/\S*$/) }).strict(),
    z.object({ path: regexSource }).strict(),
]);

export const routeSchema = z
    .object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        upstream: z.string().min(1),
        match,
        methods: z.array(z.enum(HTTP_METHODS)).min(1).optional(),
        auth: z.enum(['required', 'optional', 'none']),
        permissions: z.array(z.enum(PERMISSION_VALUES)).min(1).optional(),
        public: z
            .array(z.object({ method: z.enum(HTTP_METHODS), path: regexSource }).strict())
            .optional(),
        pageFlag: z.string().min(1).optional(),
        timeout: duration.optional(),
        maxBodySize: z.string().regex(SIZE).optional(),
        websocket: z.boolean().optional(),
        pathRewrite: z.object({ from: regexSource, to: z.string() }).strict().optional(),
    })
    .strict();

export const rateLimitSchema = z
    .object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        method: z.enum([...HTTP_METHODS, 'UPGRADE']),
        path: regexSource,
        window: duration,
        max: z.number().int().positive(),
    })
    .strict();

const DEFAULT_LIMIT = { window: '60s', max: 100 } as const;

export const routeFileSchema = z
    .object({
        upstreams: z.record(z.string().min(1)),
        routes: z.array(routeSchema).min(1),
        rateLimits: z.array(rateLimitSchema),
        defaultRateLimit: z
            .object({ window: duration, max: z.number().int().positive() })
            .strict()
            .default(DEFAULT_LIMIT),
    })
    .strict()
    .superRefine((file, ctx) => {
        const seen = new Set<string>();
        for (const route of file.routes) {
            if (seen.has(route.id)) {
                ctx.addIssue({ code: 'custom', message: `duplicate route id "${route.id}"` });
            }
            seen.add(route.id);
            if (route.upstream !== SELF_UPSTREAM && !(route.upstream in file.upstreams)) {
                ctx.addIssue({
                    code: 'custom',
                    message: `route "${route.id}" references unknown upstream "${route.upstream}"`,
                });
            }
            if (route.auth === 'none' && (route.permissions || route.public)) {
                ctx.addIssue({
                    code: 'custom',
                    message: `route "${route.id}": permissions/public need auth required or optional`,
                });
            }
        }
        const limitIds = new Set<string>();
        for (const limit of file.rateLimits) {
            if (limit.id === 'default' || limitIds.has(limit.id)) {
                ctx.addIssue({ code: 'custom', message: `duplicate rate limit id "${limit.id}"` });
            }
            limitIds.add(limit.id);
        }
    });

export type RouteConfig = z.infer<typeof routeSchema>;
export type RateLimitConfig = z.infer<typeof rateLimitSchema>;
export type RouteFile = z.infer<typeof routeFileSchema>;
export type AuthMode = RouteConfig['auth'];
