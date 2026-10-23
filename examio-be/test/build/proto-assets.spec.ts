import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '../..');
const APPS = [
    'auth-service',
    'exam-service',
    'study-room-service',
    'vocabulary-service',
    'finance-service',
    'admin-service',
    'gateway-service',
    'r2-service',
];

const nestCli = JSON.parse(readFileSync(join(REPO, 'nest-cli.json'), 'utf8'));
const protoFilesSource = readFileSync(join(REPO, 'libs/contracts/src/index.ts'), 'utf8');

/** `PROTO_FILES` key -> proto path relative to the proto root. */
const PROTO_BY_KEY: Record<string, string> = {};
for (const m of protoFilesSource.matchAll(/(\w+):\s*\{\s*pkg:\s*'[^']+',\s*file:\s*'([^']+)'/g)) {
    PROTO_BY_KEY[m[1]] = m[2];
}

function sourceFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return sourceFiles(full);
        return /\.ts$/.test(name) && !/\.(spec|e2e-spec)\.ts$/.test(name) ? [full] : [];
    });
}

/** Lib files that bundle PROTO_FILES keys behind an exported *_REGISTRATION constant. */
const LIB_REGISTRATIONS = sourceFiles(join(REPO, 'libs/grpc/src')).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    const keys = [...text.matchAll(/PROTO_FILES\.(\w+)/g)].map((m) => m[1]);
    const names = [...text.matchAll(/export const (\w+_REGISTRATION)\b/g)].map((m) => m[1]);
    return names.map((name) => ({ name, keys }));
});

/** Every proto the app registers as a gRPC server or client (production sources only). */
function protosReferencedBy(app: string): Set<string> {
    const keys = new Set<string>();
    for (const file of sourceFiles(join(REPO, 'apps', app, 'src'))) {
        const text = readFileSync(file, 'utf8');
        for (const m of text.matchAll(/PROTO_FILES\.(\w+)/g)) keys.add(m[1]);
        for (const reg of LIB_REGISTRATIONS) {
            if (text.includes(reg.name)) reg.keys.forEach((k) => keys.add(k));
        }
    }
    return withImports([...keys].map((k) => PROTO_BY_KEY[k]));
}

/** Close the set over `import "..."` statements (protoLoader needs them on disk). */
function withImports(files: string[]): Set<string> {
    const seen = new Set<string>();
    const queue = [...files];
    while (queue.length) {
        const file = queue.pop() as string;
        if (seen.has(file)) continue;
        seen.add(file);
        const text = readFileSync(join(REPO, 'proto', file), 'utf8');
        for (const m of text.matchAll(/^import\s+"([^"]+)";/gm)) {
            if (m[1].startsWith('examio/')) queue.push(m[1]);
        }
    }
    return seen;
}

function copiedProtoDirs(app: string): Set<string> {
    const assets: Array<{ include: string; outDir: string }> =
        nestCli.projects[app].compilerOptions.assets ?? [];
    const dirs = new Set<string>();
    for (const a of assets) {
        const m = a.include.match(/^\.\.\/\.\.\/\.\.\/proto\/(examio\/[^/]+)\/\*\*\/\*\.proto$/);
        if (m && a.outDir === `dist/apps/${app}/proto/${m[1]}`) dirs.add(m[1]);
    }
    return dirs;
}

describe('nest-cli.json proto assets', () => {
    it('resolves PROTO_FILES keys from @examio/contracts', () => {
        expect(Object.keys(PROTO_BY_KEY).length).toBeGreaterThanOrEqual(9);
    });

    it.each(APPS)('%s dist carries every proto it serves or calls', (app) => {
        const dirs = copiedProtoDirs(app);
        const missing = [...protosReferencedBy(app)].filter(
            (file) => !dirs.has(file.split('/').slice(0, 2).join('/'))
        );
        expect(missing).toEqual([]);
    });
});
