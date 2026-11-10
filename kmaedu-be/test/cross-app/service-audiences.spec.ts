import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { SERVICE_AUDIENCES } from '../../apps/auth-service/src/token/service-clients';

const ROOT = join(__dirname, '..', '..');

/** `serviceMetadata.attach(metadata, '<audience>')`: the audience a caller asks auth to sign for. */
const ATTACH_AUDIENCE = /\.attach\(\s*[\w.]+\s*,\s*'([a-z][a-z0-9-]*)'\s*\)/g;

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (name === 'node_modules' || name === 'generated') return [];
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
    });
}

function requestedAudiences(): Array<{ audience: string; file: string }> {
    const srcDirs = ['apps', 'libs'].flatMap((top) =>
        readdirSync(join(ROOT, top))
            .map((name) => join(ROOT, top, name, 'src'))
            .filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory())
    );
    return srcDirs.flatMap(sourceFiles).flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(ATTACH_AUDIENCE)].map((m) => ({
            audience: m[1],
            file: relative(ROOT, file),
        }))
    );
}

describe('service-token audiences', () => {
    // auth refuses to sign a service token for an audience it does not know (401), so a
    // caller targeting a new service fails only at runtime unless the name is listed here.
    it('every audience a service asks a token for is one auth will sign', () => {
        const requested = requestedAudiences();
        expect(requested.length).toBeGreaterThan(0);
        const unknown = requested.filter(({ audience }) => !SERVICE_AUDIENCES.has(audience));
        expect(unknown).toEqual([]);
    });
});
