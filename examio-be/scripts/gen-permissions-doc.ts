/**
 * Emits docs/generated/permissions-matrix.md and rewrites the generated block
 * of docs/system/permissions.md from the permission catalog
 * (libs/auth-jwt/src/permissions.ts) and the gateway route table
 * (apps/gateway-service/config/routes.yaml). Output is deterministic (sorted,
 * no timestamps); CI re-runs this and fails on a git diff.
 *
 * Usage: yarn gen:permissions-doc
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import { parse } from 'yaml';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../libs/auth-jwt/src/permissions';

const ROUTES = resolve(__dirname, '../apps/gateway-service/config/routes.yaml');
const MATRIX = resolve(__dirname, '../../docs/generated/permissions-matrix.md');
const CURATED = resolve(__dirname, '../../docs/system/permissions.md');
const APPS = resolve(__dirname, '../apps');
const BE_ROOT = resolve(__dirname, '..');
const END = '<!-- END GENERATED -->';
const beginOf = (name: string): string => `<!-- BEGIN GENERATED: ${name} -->`;

interface RawRoute {
    id: string;
    upstream: string;
    match: { path?: string; prefix?: string };
    methods?: string[];
    auth: string;
    permissions?: string[];
}

const roles = Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[];
const permissionsOf = (role: keyof typeof ROLE_PERMISSIONS): string[] => [
    ...ROLE_PERMISSIONS[role],
];
const allPermissions = Object.values(PERMISSIONS).sort();
const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const cell = (text: string): string => text.replace(/\|/g, '\\|');
const code = (text: string): string => `\`${cell(text)}\``;

function roleTable(): string[] {
    const lines = ['| Role | Count | Permissions |', '|---|--:|---|'];
    for (const role of roles) {
        const perms = permissionsOf(role).sort();
        lines.push(
            `| \`${role}\` | ${perms.length} | ${perms.map(code).join(', ')} |`,
        );
    }
    return lines;
}

function permissionMatrix(): string[] {
    const lines = [
        `| Permission | ${roles.join(' | ')} |`,
        `|---|${roles.map(() => ':-:').join('|')}|`,
    ];
    for (const permission of allPermissions) {
        const marks = roles.map((role) =>
            (permissionsOf(role) as string[]).includes(permission) ? 'x' : '',
        );
        lines.push(`| ${code(permission)} | ${marks.join(' | ')} |`);
    }
    return lines;
}

const GUARDS = [
    'RequirePermissions',
    'RequirePermissionsOrService',
    'RequireOwnerOrPermission',
    'ServiceOnly',
    'Public',
    'Authenticated',
];

interface GrpcRow {
    service: string;
    method: string;
    guard: string;
    file: string;
}

function* sourceFiles(dir: string): Generator<string> {
    for (const name of readdirSync(dir).sort(byCodePoint)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (name !== 'node_modules' && name !== 'generated' && name !== 'test') {
                yield* sourceFiles(full);
            }
        } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
            yield full;
        }
    }
}

/** Resolves `...NAME` / `NAME` to a same-file `const NAME = [...]` literal. */
function inlineConsts(text: string, source: string): string {
    return text.replace(/(\.\.\.)?\b([A-Z][A-Z0-9_]+)\b/g, (m, spread, name) => {
        const def = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(source);
        if (!def) return m;
        return spread ? def[1].trim() : `[${def[1].trim()}]`;
    });
}

/**
 * Text parse of the Nest gRPC controllers (class decorated with
 * `@<pkg>.<Service>ControllerMethods()`). Every public method at class level is
 * an RPC; it must carry one of GUARDS or the generator throws.
 */
function grpcRows(): GrpcRow[] {
    const rows: GrpcRow[] = [];
    for (const app of readdirSync(APPS).sort(byCodePoint)) {
        const src = join(APPS, app, 'src');
        try {
            statSync(src);
        } catch {
            continue;
        }
        for (const file of sourceFiles(src)) {
            const source = readFileSync(file, 'utf8');
            const svc = /@\w+\.(\w+)ControllerMethods\(\)/.exec(source);
            if (!svc) continue;
            const rel = relative(BE_ROOT, file);
            const lines = source.split('\n');
            let decorators: string[] = [];
            let inClass = false;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!inClass) {
                    inClass = /^export class /.test(line);
                    continue;
                }
                if (/^    @\w+/.test(line)) {
                    let text = line.trim();
                    let depth = 0;
                    for (;;) {
                        depth = [...text].reduce(
                            (d, c) => d + (c === '(' ? 1 : c === ')' ? -1 : 0),
                            0,
                        );
                        if (depth <= 0 || i + 1 >= lines.length) break;
                        text += ' ' + lines[++i].trim();
                    }
                    decorators.push(text);
                    continue;
                }
                const m = /^    (?:public\s+)?(?:async\s+)?\*?([a-z]\w*)\s*[(<]/.exec(line);
                if (m && m[1] !== 'constructor') {
                    const guards = decorators.filter((d) =>
                        GUARDS.some((g) => d.startsWith(`@${g}(`)),
                    );
                    if (guards.length === 0) {
                        throw new Error(
                            `${rel}:${i + 1}: gRPC handler ${m[1]} has no guard decorator`,
                        );
                    }
                    rows.push({
                        service: svc[1],
                        method: m[1][0].toUpperCase() + m[1].slice(1),
                        guard: inlineConsts(guards.join(' '), source),
                        file: rel,
                    });
                }
                if (/^    \S/.test(line)) decorators = [];
            }
        }
    }
    if (rows.length === 0) throw new Error('no gRPC handlers found');
    return rows.sort(
        (a, b) => byCodePoint(a.service, b.service) || byCodePoint(a.method, b.method),
    );
}

function grpcTable(): string[] {
    const lines = ['| Service | RPC | Guard | Source |', '|---|---|---|---|'];
    for (const r of grpcRows()) {
        lines.push(
            `| ${r.service} | ${r.method} | ${code(r.guard)} | ${code(r.file)} |`,
        );
    }
    return lines;
}

function routeKey(route: RawRoute): string {
    return route.match.prefix
        ? `${route.match.prefix}*`
        : (route.match.path ?? '');
}

function routeSections(): string[] {
    const file = parse(readFileSync(ROUTES, 'utf8')) as { routes: RawRoute[] };
    const routes = [...file.routes].sort((a, b) => byCodePoint(a.id, b.id));
    const row = (r: RawRoute) =>
        `| ${code(r.id)} | ${r.upstream} | ${r.auth} | ${code(routeKey(r))} | ${r.methods?.length ? r.methods.join(', ') : 'all'} |`;
    const head = [
        '| Route id | Upstream | Auth | Path | Methods |',
        '|---|---|---|---|---|',
    ];
    const out: string[] = [];
    for (const permission of allPermissions) {
        const hits = routes.filter((r) => r.permissions?.includes(permission));
        if (hits.length === 0) continue;
        out.push(`### ${code(permission)}`, '', ...head, ...hits.map(row), '');
    }
    const unguarded = routes.filter((r) => !r.permissions?.length);
    out.push(
        '### No gateway permission',
        '',
        'The gateway only checks the token (`auth`); the service decides authorization with its own decorator.',
        '',
        ...head,
        ...unguarded.map(row),
        '',
    );
    return out;
}

function renderMatrix(): string {
    return [
        '# Permissions matrix',
        '',
        '<!-- DO NOT EDIT. Generated by examio-be/scripts/gen-permissions-doc.ts (run `yarn gen:permissions-doc` in examio-be). -->',
        '',
        'Sources: `examio-be/libs/auth-jwt/src/permissions.ts` (`PERMISSIONS`, `ROLE_PERMISSIONS`) and `examio-be/apps/gateway-service/config/routes.yaml`. Curated rules: [system/permissions.md](../system/permissions.md).',
        '',
        '## Role to permissions',
        '',
        ...roleTable(),
        '',
        '## Permission by role',
        '',
        ...permissionMatrix(),
        '',
        '## Permission to gateway routes',
        '',
        'Routes whose `permissions` list names the permission (the gateway requires ALL listed). Services enforce per-handler declarations on top of this.',
        '',
        ...routeSections(),
        '## gRPC handler guards',
        '',
        'Every Nest gRPC handler and its guard decorator (`ServiceOnly` lists the allowed service callers; `RequirePermissionsOrService` accepts a user token with the permissions, or a service token: from `callers` when given, any service when omitted, none for `callers: []`). The Python ai-service is not listed: its interceptor accepts service tokens only.',
        '',
        ...grpcTable(),
        '',
    ].join('\n').replace(/\n+$/, '\n');
}

function replaceBlock(text: string, name: string, body: string[]): string {
    const begin = beginOf(name);
    const start = text.indexOf(begin);
    const end = text.indexOf(END, start);
    if (start === -1 || end === -1) {
        throw new Error(`${CURATED}: missing ${begin} ... ${END} block`);
    }
    return (
        text.slice(0, start) +
        [begin, '', ...body, '', END].join('\n') +
        text.slice(end + END.length)
    );
}

function renderCurated(): string {
    const current = readFileSync(CURATED, 'utf8');
    const withRoles = replaceBlock(current, 'permissions', roleTable());
    return replaceBlock(withRoles, 'grpc-guards', grpcTable());
}

writeFileSync(MATRIX, renderMatrix(), 'utf8');
writeFileSync(CURATED, renderCurated(), 'utf8');
console.log(`wrote ${MATRIX}`);
console.log(`updated ${CURATED}`);
