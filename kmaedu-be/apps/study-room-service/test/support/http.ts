import * as request from 'supertest';
import type { Server } from 'http';

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** One request against the app; no token = anonymous. Paths are under `/api/v1`. */
export function call(
    server: Server,
    method: Method,
    path: string,
    token?: string,
    body?: object
): request.Test {
    let req = request(server)[method](`/api/v1${path}`);
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
}

/** Every key anywhere in `value` (arrays and nested objects included). */
export function keysDeep(
    value: unknown,
    into = new Set<string>()
): Set<string> {
    if (Array.isArray(value)) {
        value.forEach((v) => keysDeep(v, into));
    } else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            into.add(k);
            keysDeep(v, into);
        }
    }
    return into;
}
