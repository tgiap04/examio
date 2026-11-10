import { createServer } from 'net';

/** Ports below every OS ephemeral range (Linux 32768+, macOS/Windows 49152+). */
const RANGE_START = 20_000;
const RANGE_SIZE = 10_000;

function canBind(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const probe = createServer();
        probe.once('error', () => resolve(false));
        // Same interface the gRPC server binds (0.0.0.0).
        probe.listen(port, '0.0.0.0', () => probe.close(() => resolve(true)));
    });
}

/**
 * A gRPC port that outgoing connections cannot steal. The old "listen on 0,
 * read the port, close" probe handed out an EPHEMERAL port, which the OS was
 * free to give to any outgoing client socket (Redis, AMQP, fetch) before the
 * gRPC server bound it: a 1-in-6 EADDRINUSE. Ephemeral ranges never overlap
 * this one, so only another listener can collide, and `isAddrInUse` lets the
 * caller retry that case. (Nest does not expose the port a gRPC server bound
 * to `:0`, so binding 0 and reading it back is not possible here.)
 */
export async function reservePort(): Promise<number> {
    for (let attempt = 0; attempt < 50; attempt++) {
        const port = RANGE_START + Math.floor(Math.random() * RANGE_SIZE);
        if (await canBind(port)) return port;
    }
    throw new Error('no free test port found in the reserved range');
}

export function isAddrInUse(err: unknown): boolean {
    const e = err as { code?: string; message?: string } | undefined;
    return e?.code === 'EADDRINUSE' || /EADDRINUSE|address already in use|No address added/i.test(e?.message ?? '');
}
