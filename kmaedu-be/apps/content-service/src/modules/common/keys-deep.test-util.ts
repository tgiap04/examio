/** Test helper: every key anywhere in a value (nested objects and arrays included). */
export function keysOf(value: unknown, into: string[] = []): string[] {
    if (Array.isArray(value)) {
        value.forEach((v) => keysOf(v, into));
    } else if (value && typeof value === 'object' && !(value instanceof Date)) {
        for (const [k, v] of Object.entries(value)) {
            into.push(k);
            keysOf(v, into);
        }
    }
    return into;
}
