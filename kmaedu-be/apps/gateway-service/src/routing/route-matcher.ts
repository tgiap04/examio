import type { CompiledRoute } from './route-table';

/**
 * Raw paths that could smuggle a different resource past prefix matching:
 * dot segments, encoded dots / slashes / backslashes, literal backslashes.
 */
const UNSAFE_PATH = /(^|\/)\.\.?(\/|$)|%2e|%2f|%5c|\\/i;

export function isUnsafePath(pathname: string): boolean {
    return UNSAFE_PATH.test(pathname);
}

function allows(route: CompiledRoute, method: string): boolean {
    return !route.methods || route.methods.has(method);
}

function underPrefix(prefix: string, pathname: string): boolean {
    return (
        pathname === prefix ||
        (pathname.startsWith(prefix) && (prefix.endsWith('/') || pathname[prefix.length] === '/'))
    );
}

/**
 * `path` regex routes first (file order), then the longest `prefix` on a
 * segment boundary. Query strings are not part of `pathname`.
 */
export function matchRoute(
    routes: readonly CompiledRoute[],
    method: string,
    pathname: string
): CompiledRoute | undefined {
    if (isUnsafePath(pathname)) return undefined;

    let best: CompiledRoute | undefined;
    for (const route of routes) {
        if (!allows(route, method)) continue;
        if (route.pathRegex) {
            if (route.pathRegex.test(pathname)) return route;
        } else if (
            route.prefix !== undefined &&
            underPrefix(route.prefix, pathname) &&
            (!best || route.prefix.length > best.prefix!.length)
        ) {
            best = route;
        }
    }
    return best;
}
