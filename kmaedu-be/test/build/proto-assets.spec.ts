import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '../..');
const APPS = [
    'auth-service',
    'content-service',
    'assessment-service',
    'study-room-service',
    'vocabulary-service',
    'document-service',
    'ai-chat-service',
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
            if (m[1].startsWith('kmaedu/')) queue.push(m[1]);
        }
    }
    return seen;
}

function copiedProtoDirs(app: string): Set<string> {
    const assets: Array<{ include: string; outDir: string }> =
        nestCli.projects[app].compilerOptions.assets ?? [];
    const dirs = new Set<string>();
    for (const a of assets) {
        const m = a.include.match(/^\.\.\/\.\.\/\.\.\/proto\/(kmaedu\/[^/]+)\/\*\*\/\*\.proto$/);
        if (m && a.outDir === `dist/apps/${app}/proto/${m[1]}`) dirs.add(m[1]);
    }
    return dirs;
}

describe('nest-cli.json proto assets', () => {
    it('resolves PROTO_FILES keys from @kmaedu/contracts', () => {
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

describe('phase 15 contracts', () => {
    const read = (file: string) => readFileSync(join(REPO, 'proto', file), 'utf8');

    it('registers the document and ai service protos in PROTO_FILES', () => {
        expect(PROTO_BY_KEY.document).toBe('kmaedu/document/v1/document.proto');
        expect(PROTO_BY_KEY.ai).toBe('kmaedu/ai/v1/ai.proto');
    });

    it('declares the required DocumentService and AiService RPCs', () => {
        const document = read('kmaedu/document/v1/document.proto');
        for (const rpc of [
            'CreateUpload',
            'GetDocumentsByIds',
            'AssertOwnership',
            'GetQuota',
            'EnsureProcessed',
            'DeleteDocuments',
        ]) {
            expect(document).toMatch(new RegExp(`rpc ${rpc}\\(`));
        }
        const ai = read('kmaedu/ai/v1/ai.proto');
        expect(ai).toMatch(/rpc StreamChat\(\w+\) returns \(stream StreamChatResponse\)/);
        for (const rpc of ['Query', 'GenerateWordFamily', 'ListModels']) {
            expect(ai).toMatch(new RegExp(`rpc ${rpc}\\(`));
        }
    });

    it('keeps r2 additive: existing RPCs stay and CreatePresignedDownload is added', () => {
        const r2 = read('kmaedu/r2/v1/r2.proto');
        for (const rpc of ['UploadFile', 'DeleteObjects', 'CreatePresignedDownload']) {
            expect(r2).toMatch(new RegExp(`rpc ${rpc}\\(`));
        }
    });

    it('defines every phase 15 event payload message', () => {
        const events = ['document_events', 'ai_events', 'content_events']
            .map((name) => read(`kmaedu/events/v1/${name}.proto`))
            .join('\n');
        for (const message of [
            'DocumentUploaded',
            'DocumentDeleted',
            'AiDocumentProcessed',
            'AiDocumentFailed',
            'AiGenerationCompleted',
            'AiGenerationFailed',
            'ContentGenerationRequested',
            'ContentQuizSetDeleted',
        ]) {
            expect(events).toMatch(new RegExp(`^message ${message} \\{`, 'm'));
        }
    });
});
