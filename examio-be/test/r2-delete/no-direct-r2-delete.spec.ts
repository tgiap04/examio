import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Phase 11 (RT-8): auth, assessment and content never call R2 deletes from a request path. A
 * delete is queued with `R2DeleteTaskWriter.enqueue(tx, keys)` in the same tx as the
 * row change; only the R2 gRPC adapter (used by the worker) may call `deleteObjects`.
 */
const ROOT = join(__dirname, '..', '..');
const SERVICES = ['apps/auth-service/src', 'apps/assessment-service/src', 'apps/content-service/src'];
const ALLOWED = new Set(['clients/r2.client.ts', 'clients/r2-delete.sender.ts']); // gRPC adapter + the worker's sender (relative to src/)
const DIRECT_CALL = /\.(deleteFile|deleteImage|deleteObjects)\(/;

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (name === 'generated' || name === 'node_modules') return [];
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
    });
}

describe('no direct R2 deletes outside the worker (auth, assessment, content)', () => {
    it.each(SERVICES)('%s has no direct deleteFile/deleteImage/deleteObjects call', (service) => {
        const base = join(ROOT, service);
        const offenders = sourceFiles(base).flatMap((file) => {
            if (ALLOWED.has(relative(base, file))) return [];
            return readFileSync(file, 'utf8')
                .split('\n')
                .map((line, i) => ({ line, n: i + 1 }))
                .filter(({ line }) => DIRECT_CALL.test(line) && !line.trim().startsWith('//'))
                .map(({ n }) => `${relative(ROOT, file)}:${n}`);
        });
        expect(offenders).toEqual([]);
    });
});
