/**
 * Model ownership check (phase 10). Every Prisma model is read and written by
 * exactly ONE service in code, even while the database is still shared; phase
 * 11 uses this same map to split the schemas.
 *
 *   ts-node scripts/check-model-ownership.ts            # report mode, exit 0
 *   ts-node scripts/check-model-ownership.ts --strict   # exit 1 on any violation
 *   ts-node scripts/check-model-ownership.ts --root <dir> [--strict]   # scan another tree (self-test)
 *
 * Detected accesses: `<prisma|tx|client|db|trx>.<model>` in `apps/<app>/src/**`
 * (specs excluded), the repository idiom `modelName = '<model>'`, and relation
 * access to a foreign model through `include:`/`select:`, `where:`/`orderBy:`
 * relation filters and nested writes (`connect`/`create`/`connectOrCreate`),
 * including fragments passed as a same-file `const x = { ... }` or `...x` spread,
 * resolved with the relations of the merged Prisma schema.
 * Source of truth for the map: ARCHITECTURE.md Appendix A.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

export type Service = 'auth' | 'finance' | 'exam' | 'studyroom' | 'vocabulary' | 'admin' | 'r2' | 'gateway';

/** Owner app directory -> service name. ai-service (python) is out of scope here. */
export const APP_SERVICE: Readonly<Record<string, Service>> = {
    'auth-service': 'auth',
    'finance-service': 'finance',
    'exam-service': 'exam',
    'study-room-service': 'studyroom',
    'vocabulary-service': 'vocabulary',
    'admin-service': 'admin',
    'r2-service': 'r2',
    'gateway-service': 'gateway',
};

/** Every service keeps its own outbox / idempotency tables (libs/messaging) and, when it owns R2 objects, its own R2 delete queue. */
export const SHARED_MODELS: ReadonlySet<string> = new Set(['OutboxEvent', 'ProcessedEvent', 'R2DeleteTask']);

/**
 * Model -> owning service (ARCH Appendix A). Until phases 12-15 extract the
 * content/assessment/study-room/vocabulary/ai-chat/document services, `exam`
 * owns all of those, and the ai-service tables are listed as `exam` too.
 */
export const OWNERSHIP: Readonly<Record<string, Service>> = {
    // auth
    User: 'auth', UserSession: 'auth', VerifyAccountCode: 'auth',
    ResetPasswordCode: 'auth', RoleChangeLog: 'auth',
    // finance
    Wallet: 'finance', WalletTransaction: 'finance', Payment: 'finance', UserSubscription: 'finance',
    // admin
    AdminAudit: 'admin', PageFeatureFlag: 'admin',
    // exam (document, ai-service tables, content, assessment, ai-chat)
    UserStorage: 'exam', UserMonthlyFileUpload: 'exam', Document: 'exam', DocumentEntity: 'exam',
    UserStorageGraph: 'exam', UserStorageGraphGroup: 'exam',
    QuizSet: 'exam', QuizSetLabel: 'exam', QuizQuestion: 'exam', DetailsQuizQuestion: 'exam',
    FlashCardSet: 'exam', FlashCardSetLabel: 'exam', FlashCard: 'exam', DetailsFlashCard: 'exam',
    HistoryGeneratedQuizz: 'exam', HistoryGeneratedFlashcard: 'exam', QuizPracticeAttempt: 'exam',
    FlashCardViewHistory: 'exam', UserPinnedFlashcard: 'exam', FlashcardStudyProgress: 'exam',
    ExamRoom: 'exam', ExamSession: 'exam', ExamAttempt: 'exam', CheatingLog: 'exam',
    UserPinnedExamRoom: 'exam',
    // study-room (phase 12)
    StudyRoom: 'studyroom', StudyRoomMember: 'studyroom', StudyRoomPlaylistItem: 'studyroom', StudyRoomChatBlock: 'studyroom',
    // vocabulary (phase 12)
    WordFamilyCategory: 'vocabulary', WordFamily: 'vocabulary', UserSavedWordFamily: 'vocabulary',
    AIChat: 'exam', AIChatMessage: 'exam', AIChatDocument: 'exam', SubjectCategory: 'exam', Subject: 'exam',
};

export interface Violation {
    file: string;
    line: number;
    model: string;
    owner: Service;
    app: Service;
}

/** Prisma client delegate name: first character lower-cased (`AIChat` -> `aIChat`). */
export const delegateOf = (model: string): string => model.charAt(0).toLowerCase() + model.slice(1);

const CLIENT_ACCESS = /\b(?:prisma|tx|client|trx|db|prismaClient)\s*\.\s*([A-Za-z]\w*)\b/g;
const MODEL_NAME = /\bmodelName\s*(?::\s*string\s*)?=\s*['"]([A-Za-z]\w*)['"]/g;

/** Models declared in the merged Prisma schema (used to prove the map is complete). */
export function schemaModels(schemaText: string): string[] {
    return [...schemaText.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
}

export function unmappedModels(models: readonly string[]): string[] {
    return models.filter((m) => !(m in OWNERSHIP) && !SHARED_MODELS.has(m));
}

/** model -> (relation field -> target model), from the merged schema. */
export type RelationMap = ReadonlyMap<string, ReadonlyMap<string, string>>;

export function relationMap(schemaText: string): RelationMap {
    const models = new Set(schemaModels(schemaText));
    const out = new Map<string, Map<string, string>>();
    for (const block of schemaText.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
        const fields = new Map<string, string>();
        for (const line of block[2].split('\n')) {
            const m = /^\s*(\w+)\s+(\w+)(?:\[\]|\?)?(?:\s|$)/.exec(line);
            if (m && models.has(m[2])) fields.set(m[1], m[2]);
        }
        out.set(block[1], fields);
    }
    return out;
}

const OPENERS: Readonly<Record<string, string>> = { '(': ')', '{': '}', '[': ']' };

/** Index of the bracket closing the one at `open` (strings are skipped); -1 when unbalanced. */
function closingIndex(text: string, open: number): number {
    const stack: string[] = [];
    let quote: string | null = null;
    for (let i = open; i < text.length; i++) {
        const c = text[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
        } else if (c === "'" || c === '"' || c === '`') quote = c;
        else if (OPENERS[c]) stack.push(OPENERS[c]);
        else if (c === stack[stack.length - 1]) {
            stack.pop();
            if (stack.length === 0) return i;
        }
    }
    return -1;
}

/** Top-level comma-separated pieces of a bracket body. */
function splitTop(body: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    let quote: string | null = null;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
        } else if (c === "'" || c === '"' || c === '`') quote = c;
        else if (OPENERS[c]) depth++;
        else if (c === ')' || c === '}' || c === ']') depth--;
        else if (c === ',' && depth === 0) {
            parts.push(body.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(body.slice(start));
    return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * `{ a: 1, b: { c }, ...d, e }` -> [['a','1'], ['b','{ c }'], ['...','d'], ['e','e']]:
 * top-level entries of an object literal (spreads and shorthands included).
 */
function objectEntries(obj: string): Array<[string, string]> {
    const entries: Array<[string, string]> = [];
    for (const part of splitTop(obj.slice(1, -1))) {
        const spread = /^\.\.\.\s*([\s\S]+)$/.exec(part);
        if (spread) {
            entries.push(['...', spread[1].trim()]);
            continue;
        }
        const pair = /^['"]?(\w+)['"]?\s*:\s*([\s\S]*)$/.exec(part);
        if (pair) entries.push([pair[1], pair[2].trim()]);
        else if (/^\w+$/.test(part)) entries.push([part, part]);
    }
    return entries;
}

/** Same-file `const x = { ... }` object literals (query fragments passed around by name). */
function objectConsts(text: string): Map<string, string> {
    const consts = new Map<string, string>();
    const decl = /\b(?:const|let|var)\s+(\w+)\s*(?::[^=;]+)?=\s*(?:Prisma\.validator<[^>]*>\(\)\(\s*)?\{/g;
    for (const m of text.matchAll(decl)) {
        const open = m.index! + m[0].length - 1;
        const close = closingIndex(text, open);
        if (close > 0) consts.set(m[1], text.slice(open, close + 1));
    }
    return consts;
}

const LOGICAL = new Set(['AND', 'OR', 'NOT']);
const FILTER_WRAPPERS = new Set(['is', 'isNot', 'some', 'every', 'none']);
const NESTED_WRITES = new Set(['create', 'update', 'upsert', 'connectOrCreate']);

/** Foreign relations reached by one query: include/select, where, orderBy, nested writes. */
class RelationScan {
    private readonly seen = new Set<string>();

    constructor(
        private readonly relations: RelationMap,
        private readonly app: Service,
        private readonly consts: ReadonlyMap<string, string>
    ) {}

    get targets(): string[] {
        return [...this.seen];
    }

    /** `x`, `x as const`, `x satisfies T` -> the const's literal; a literal stays; anything else undefined. */
    private resolve(value: string): string | undefined {
        const v = value.replace(/\s+(?:as|satisfies)\s+[\s\S]*$/, '').trim();
        if (v.startsWith('{') || v.startsWith('[')) return v;
        return this.consts.get(v);
    }

    /** Entries of an object literal with spreads expanded and const references resolved. */
    private entries(obj: string, depth = 0): Array<[string, string]> {
        const out: Array<[string, string]> = [];
        for (const [key, value] of objectEntries(obj)) {
            const resolved = this.resolve(value);
            if (key === '...') {
                if (resolved?.startsWith('{') && depth < 5) out.push(...this.entries(resolved, depth + 1));
            } else out.push([key, resolved ?? value]);
        }
        return out;
    }

    private items(value: string): string[] {
        const v = this.resolve(value) ?? value;
        if (v.startsWith('[')) return splitTop(v.slice(1, -1)).map((i) => this.resolve(i) ?? i);
        return v.startsWith('{') ? [v] : [];
    }

    private relation(model: string, field: string): string | undefined {
        const target = this.relations.get(model)?.get(field);
        if (!target) return undefined;
        if (OWNERSHIP[target] && OWNERSHIP[target] !== this.app) this.seen.add(target);
        return target;
    }

    /** One query's argument object (or a variable holding it). */
    query(model: string, args: string): void {
        const obj = this.resolve(args);
        if (!obj?.startsWith('{')) return;
        for (const [key, value] of this.entries(obj)) {
            if (key === 'include' || key === 'select') this.selection(model, value);
            else if (key === 'where') this.filter(model, value);
            else if (key === 'orderBy') this.order(model, value);
            else if (key === 'data' || key === 'create' || key === 'update') this.write(model, value);
        }
    }

    private selection(model: string, value: string): void {
        if (!value.startsWith('{')) return;
        for (const [field, nested] of this.entries(value)) {
            const target = this.relation(model, field);
            if (target && nested.startsWith('{')) this.query(target, nested);
        }
    }

    private filter(model: string, value: string): void {
        for (const item of this.items(value)) {
            for (const [key, nested] of this.entries(item)) {
                if (LOGICAL.has(key)) this.filter(model, nested);
                else if (FILTER_WRAPPERS.has(key)) this.filter(model, nested);
                else {
                    const target = this.relation(model, key);
                    if (target) this.filter(target, nested);
                }
            }
        }
    }

    private order(model: string, value: string): void {
        for (const item of this.items(value)) {
            for (const [field, nested] of this.entries(item)) {
                const target = this.relation(model, field);
                if (target && nested.startsWith('{')) this.order(target, nested);
            }
        }
    }

    /** `data` / `create` / `update` payloads: a relation key is a nested write on that model. */
    private write(model: string, value: string): void {
        for (const item of this.items(value)) {
            for (const [field, nested] of this.entries(item)) {
                const target = this.relation(model, field);
                if (!target) continue;
                for (const [op, payload] of this.entries(nested.startsWith('{') ? nested : '{}')) {
                    if (!NESTED_WRITES.has(op)) continue;
                    this.query(target, payload);
                    this.write(target, payload);
                }
            }
        }
    }
}

const CALL = /\b(?:prisma|tx|client|trx|db|prismaClient)\s*\.\s*([A-Za-z]\w*)\s*\.\s*\w+\s*(?:<[^>]*>)?\(/g;

export function scanSource(
    text: string,
    file: string,
    app: Service,
    relations?: RelationMap
): Violation[] {
    const byDelegate = new Map<string, string>();
    for (const model of Object.keys(OWNERSHIP)) byDelegate.set(delegateOf(model), model);
    const found: Violation[] = [];
    const lines = text.split('\n');
    lines.forEach((content, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(content)) return;
        const hits = [
            ...[...content.matchAll(CLIENT_ACCESS)].map((m) => m[1]),
            ...[...content.matchAll(MODEL_NAME)].map((m) => m[1]),
        ];
        for (const name of hits) {
            const model = byDelegate.get(name);
            if (!model) continue;
            const owner = OWNERSHIP[model];
            if (owner !== app) found.push({ file, line: i + 1, model, owner, app });
        }
    });
    if (relations) {
        const byDelegateModel = byDelegate;
        const consts = objectConsts(text);
        for (const call of text.matchAll(CALL)) {
            const model = byDelegateModel.get(call[1]);
            if (!model) continue;
            const open = call.index! + call[0].length - 1;
            const close = closingIndex(text, open);
            if (close < 0) continue;
            const scan = new RelationScan(relations, app, consts);
            scan.query(model, text.slice(open + 1, close).trim());
            const hits = scan.targets;
            const line = text.slice(0, call.index).split('\n').length;
            for (const target of hits) found.push({ file, line, model: target, owner: OWNERSHIP[target], app });
        }
        found.sort((a, b) => a.line - b.line);
    }
    return found;
}

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === 'node_modules' || entry === 'dist') continue;
            walk(full, out);
        } else if (/\.ts$/.test(entry) && !/\.(spec|e2e-spec|d)\.ts$/.test(entry)) {
            out.push(full);
        }
    }
    return out;
}

export function scanTree(root: string, relations?: RelationMap): Violation[] {
    const appsDir = join(root, 'apps');
    if (!existsSync(appsDir)) return [];
    const violations: Violation[] = [];
    for (const [dir, service] of Object.entries(APP_SERVICE)) {
        const src = join(appsDir, dir, 'src');
        if (!existsSync(src)) continue;
        for (const file of walk(src)) {
            violations.push(
                ...scanSource(readFileSync(file, 'utf8'), relative(root, file).split(sep).join('/'), service, relations)
            );
        }
    }
    return violations;
}

export function formatReport(violations: readonly Violation[]): string {
    const lines = violations.map(
        (v) => `${v.file}:${v.line}  ${v.model} is owned by ${v.owner}, accessed from ${v.app}`
    );
    const byPair = new Map<string, number>();
    for (const v of violations) {
        const key = `${v.app} -> ${v.model} (owner ${v.owner})`;
        byPair.set(key, (byPair.get(key) ?? 0) + 1);
    }
    const summary = [...byPair.entries()].sort().map(([k, n]) => `  ${String(n).padStart(4)}  ${k}`);
    return [
        ...lines,
        '',
        `Violations: ${violations.length}`,
        ...(summary.length ? ['By app -> model:', ...summary] : []),
    ].join('\n');
}

/**
 * Text of every per-service Prisma schema (`apps/<svc>/prisma/schema.prisma` or
 * the multi-file `apps/<svc>/prisma/schema/*.prisma`), concatenated; '' when none exist.
 */
export function serviceSchemaText(root: string): string {
    const apps = join(root, 'apps');
    if (!existsSync(apps)) return '';
    const files: string[] = [];
    for (const app of readdirSync(apps).sort()) {
        const single = join(apps, app, 'prisma', 'schema.prisma');
        const folder = join(apps, app, 'prisma', 'schema');
        if (existsSync(single)) files.push(single);
        else if (existsSync(folder) && statSync(folder).isDirectory()) {
            for (const f of readdirSync(folder).sort()) if (f.endsWith('.prisma')) files.push(join(folder, f));
        }
    }
    return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}

function main(argv: string[]): number {
    const strict = argv.includes('--strict');
    const rootIdx = argv.indexOf('--root');
    const root = rootIdx >= 0 ? argv[rootIdx + 1] : join(__dirname, '..');

    const schemaText = serviceSchemaText(root);
    let relations: RelationMap | undefined;
    if (schemaText) {
        const missing = unmappedModels(schemaModels(schemaText));
        if (missing.length) {
            console.error(`Unmapped Prisma models (add them to OWNERSHIP): ${missing.join(', ')}`);
            return 2;
        }
        relations = relationMap(schemaText);
    }

    const violations = scanTree(root, relations);
    console.log(formatReport(violations));
    if (strict && violations.length > 0) {
        console.error(`\nmodel ownership: ${violations.length} violation(s) (strict mode)`);
        return 1;
    }
    return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
