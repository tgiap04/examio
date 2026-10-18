import 'reflect-metadata';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { GatewayModule } from '../src/gateway.module';

const GLOBAL_PREFIX = '/api/v1';
const FIXTURE_PATH = join(__dirname, 'fixtures', 'route-inventory.json');

type Ctor = new (...args: never[]) => unknown;

function toPaths(raw: unknown): string[] {
    const list = Array.isArray(raw) ? raw : [raw ?? ''];
    return list.map((p) => String(p).replace(/^\/+|\/+$/g, ''));
}

function joinPath(...parts: string[]): string {
    const joined = parts.filter(Boolean).join('/');
    return `${GLOBAL_PREFIX}${joined ? `/${joined}` : ''}`;
}

/**
 * Reads Nest route metadata from every controller registered in GatewayModule
 * and returns sorted `METHOD /api/v1/path` lines.
 */
export function buildRouteInventory(): string[] {
    const controllers: Ctor[] =
        Reflect.getMetadata('controllers', GatewayModule) ?? [];
    const lines = new Set<string>();

    for (const controller of controllers) {
        const basePaths = toPaths(
            Reflect.getMetadata(PATH_METADATA, controller)
        );
        const proto = controller.prototype as Record<string, unknown>;

        for (const name of Object.getOwnPropertyNames(proto)) {
            const handler = proto[name];
            if (name === 'constructor' || typeof handler !== 'function') {
                continue;
            }
            const method = Reflect.getMetadata(METHOD_METADATA, handler);
            if (method === undefined) {
                continue;
            }
            const routePaths = toPaths(
                Reflect.getMetadata(PATH_METADATA, handler)
            );
            const verb =
                method === RequestMethod.ALL ? 'ALL' : RequestMethod[method];
            for (const base of basePaths) {
                for (const route of routePaths) {
                    lines.add(`${verb} ${joinPath(base, route)}`);
                }
            }
        }
    }

    return [...lines].sort((a, b) => {
        const [ma, pa] = a.split(' ');
        const [mb, pb] = b.split(' ');
        return pa === pb ? ma.localeCompare(mb) : pa.localeCompare(pb);
    });
}

describe('gateway route inventory', () => {
    it('matches the committed route-inventory.json (phase 05 contract)', () => {
        const actual = buildRouteInventory();

        if (process.env.UPDATE_ROUTE_INVENTORY === '1') {
            writeFileSync(
                FIXTURE_PATH,
                `${JSON.stringify(actual, null, 4)}\n`
            );
        }

        expect(existsSync(FIXTURE_PATH)).toBe(true);
        const committed: string[] = JSON.parse(
            readFileSync(FIXTURE_PATH, 'utf8')
        );
        expect(actual).toEqual(committed);
    });

    it('lists every route exactly once with a valid shape', () => {
        const actual = buildRouteInventory();
        expect(actual.length).toBeGreaterThan(50);
        expect(new Set(actual).size).toBe(actual.length);
        for (const line of actual) {
            expect(line).toMatch(
                /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|ALL) \/api\/v1(\/[^\s]*)?$/
            );
        }
    });
});
