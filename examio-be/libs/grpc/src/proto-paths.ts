import { existsSync } from 'fs';
import { join } from 'path';

/** Loader options shared by clients and servers (matches ts-proto forceLong=string). */
export const PROTO_LOADER_OPTIONS = {
    keepCase: false,
    longs: String,
    defaults: true,
    oneofs: true,
};

/**
 * Directory holding `examio/**\/*.proto` at runtime: `PROTO_ROOT`, else the
 * `proto/` asset copied next to the bundled `main.js`, else `<cwd>/proto`
 * (dev + jest).
 */
export function resolveProtoRoot(): string {
    if (process.env.PROTO_ROOT) return process.env.PROTO_ROOT;
    const bundled = join(__dirname, 'proto');
    if (existsSync(bundled)) return bundled;
    return join(process.cwd(), 'proto');
}

