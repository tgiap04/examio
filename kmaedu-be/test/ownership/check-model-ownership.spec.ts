import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import {
    delegateOf,
    relationMap,
    scanSource,
    schemaModels,
    serviceSchemaText,
    unmappedModels,
} from '../../scripts/check-model-ownership';

const SCRIPT = join(__dirname, '../../scripts/check-model-ownership.ts');

function fixture(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'ownership-'));
    for (const [path, body] of Object.entries(files)) {
        const full = join(root, path);
        mkdirSync(join(full, '..'), { recursive: true });
        writeFileSync(full, body);
    }
    return root;
}
const run = (root: string, ...args: string[]) =>
    spawnSync(
        process.execPath,
        ['-r', 'ts-node/register/transpile-only', SCRIPT, '--root', root, ...args],
        { encoding: 'utf8', env: { ...process.env, TS_NODE_COMPILER_OPTIONS: '{"module":"commonjs"}' } }
    );

describe('check-model-ownership (self-test)', () => {
    it('every model in the real schema is mapped to an owner', () => {
        const schema = serviceSchemaText(join(__dirname, '../..'));
        expect(schemaModels(schema).length).toBeGreaterThan(40);
        expect(unmappedModels(schemaModels(schema))).toEqual([]);
    });

    it('uses the Prisma delegate casing (AIChat -> aIChat)', () => {
        expect(delegateOf('AIChat')).toBe('aIChat');
        expect(delegateOf('QuizQuestion')).toBe('quizQuestion');
    });

    it('flags a foreign model access and accepts an owned or shared one', () => {
        const code = [
            'await this.prisma.quizSet.findUnique({});',
            'await tx.user.update({});',
            'await tx.outboxEvent.create({});',
            '// this.prisma.flashCardSet.count()',
        ].join('\n');
        const v = scanSource(code, 'apps/admin-service/src/x.ts', 'admin');
        expect(v.map((x) => [x.model, x.owner, x.app, x.line])).toEqual([
            ['QuizSet', 'content', 'admin', 1],
            ['User', 'auth', 'admin', 2],
        ]);
    });

    it('catches the repository modelName idiom', () => {
        const v = scanSource("protected modelName = 'quizQuestion';", 'apps/assessment-service/src/r.ts', 'assessment');
        expect(v).toHaveLength(1);
        expect(v[0]).toMatchObject({ model: 'QuizQuestion', owner: 'content' });
    });

    it('a fixture violation exits 1 in strict mode and 0 in report mode', () => {
        const root = fixture({
            'apps/admin-service/src/bad.ts': 'export const f = (prisma: any) => prisma.quizSet.findMany();\n',
            'apps/content-service/src/ok.ts': 'export const g = (prisma: any) => prisma.quizSet.findMany();\n',
        });
        try {
            const strict = run(root, '--strict');
            expect(strict.status).toBe(1);
            expect(strict.stdout).toContain('apps/admin-service/src/bad.ts:1  QuizSet is owned by content, accessed from admin');
            expect(strict.stdout).not.toContain('ok.ts');
            expect(run(root).status).toBe(0);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('a clean fixture exits 0 in strict mode; spec files are ignored', () => {
        const root = fixture({
            'apps/content-service/src/ok.ts': 'export const g = (prisma: any) => prisma.quizSet.findMany();\n',
            'apps/admin-service/src/x.spec.ts': 'prisma.quizSet.findMany();\n',
        });
        try {
            expect(run(root, '--strict').status).toBe(0);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    describe('relation access through include/select', () => {
        const schema = [
            'model User {',
            '  id String @id',
            '  quizSet QuizSet?',
            '  flashCardSet FlashCardSet?',
            '  sessions UserSession[]',
            '}',
            'model QuizSet {',
            '  id String @id',
            '  user User @relation(fields: [userId], references: [id])',
            '  userId String',
            '  questions QuizQuestion[]',
            '}',
            'model UserSession { id String @id }',
            'model FlashCardSet { id String @id }',
            'model QuizQuestion { id String @id }',
        ].join('\n');
        const relations = relationMap(schema);

        it('parses relation fields (field -> target model), ignoring scalars', () => {
            expect(relations.get('User')?.get('quizSet')).toBe('QuizSet');
            expect(relations.get('User')?.get('sessions')).toBe('UserSession');
            expect(relations.get('User')?.has('id')).toBe(false);
        });

        it('flags include of a foreign relation (auth reading quiz/flashcard sets through User)', () => {
            const code = [
                'await this.prisma.user.findFirst({',
                '    where: { id },',
                '    include: { quizSet: { select: { title: true } }, flashCardSet: true, sessions: true },',
                '});',
            ].join('\n');
            const v = scanSource(code, 'apps/auth-service/src/r.ts', 'auth', relations);
            expect(v.map((x) => [x.model, x.owner, x.app, x.line])).toEqual([
                ['QuizSet', 'content', 'auth', 1],
                ['FlashCardSet', 'content', 'auth', 1],
            ]);
        });

        it('flags a foreign relation inside select, nested includes, and accepts own relations', () => {
            const code = [
                'await this.prisma.user.findUnique({ where: { id }, select: { id: true, quizSet: { select: { questions: true } } } });',
                'await this.prisma.user.findMany({ include: { sessions: true } });',
            ].join('\n');
            const v = scanSource(code, 'apps/admin-service/src/r.ts', 'auth', relations);
            expect(v.map((x) => x.model)).toEqual(['QuizSet', 'QuizQuestion']);
        });

        it('without a schema the relation check is skipped (backward compatible)', () => {
            const code = 'await this.prisma.user.findMany({ include: { quizSet: true } });';
            expect(scanSource(code, 'apps/auth-service/src/r.ts', 'auth')).toEqual([]);
        });

        const hits = (code: string, app: 'auth' | 'content' | 'admin' = 'auth') =>
            scanSource(code, `apps/${app}-service/src/r.ts`, app, relations).map((x) => x.model);

        it('flags a relation filter in where (plain, and/or/not, is/some wrappers) and in orderBy', () => {
            expect(hits('await this.prisma.user.findMany({ where: { quizSet: { title: { contains: "a" } } } });')).toEqual(['QuizSet']);
            expect(
                hits('await this.prisma.user.findMany({ where: { OR: [{ id }, { NOT: { quizSet: { is: { title: "" } } } }] } });')
            ).toEqual(['QuizSet']);
            expect(
                hits('await this.prisma.quizSet.findMany({ where: { user: { email: { contains: q } } } });', 'content')
            ).toEqual(['User']);
            expect(hits('await this.prisma.user.findMany({ orderBy: { quizSet: { title: "desc" } } });')).toEqual(['QuizSet']);
            expect(hits('await this.prisma.user.findMany({ orderBy: [{ flashCardSet: { title: "asc" } }] });')).toEqual([
                'FlashCardSet',
            ]);
        });

        it('accepts own relations and scalar filters in where/orderBy', () => {
            expect(
                hits('await this.prisma.user.findMany({ where: { sessions: { some: { id } }, id: { in: ids } }, orderBy: { id: "asc" } });')
            ).toEqual([]);
            expect(hits('await this.prisma.quizSet.findMany({ where: { userId } });', 'content')).toEqual([]);
        });

        it('follows include/select/where passed through a same-file const or a spread', () => {
            const viaConst = [
                'const withQuizSet = { quizSet: { select: { title: true } } };',
                'await this.prisma.user.findMany({ include: withQuizSet });',
            ].join('\n');
            expect(hits(viaConst)).toEqual(['QuizSet']);
            const viaSpread = [
                'const base = { include: { flashCardSet: true } } as const;',
                'await this.prisma.user.findFirst({ where: { id }, ...base });',
            ].join('\n');
            expect(hits(viaSpread)).toEqual(['FlashCardSet']);
            const viaArgs = [
                'const args = { where: { quizSet: { is: {} } } };',
                'await this.prisma.user.findMany(args);',
            ].join('\n');
            expect(hits(viaArgs)).toEqual(['QuizSet']);
            const own = ['const inc = { sessions: true };', 'await this.prisma.user.findMany({ include: inc });'].join('\n');
            expect(hits(own)).toEqual([]);
        });

        it('flags nested writes (connect / create / connectOrCreate) on a foreign relation', () => {
            expect(
                hits('await this.prisma.quizSet.create({ data: { id, user: { connect: { id: userId } } } });', 'content')
            ).toEqual(['User']);
            expect(hits('await this.prisma.user.update({ where: { id }, data: { quizSet: { create: { id: w } } } });')).toEqual([
                'QuizSet',
            ]);
            expect(
                hits(
                    'await this.prisma.user.upsert({ where: { id }, create: { flashCardSet: { connectOrCreate: { where: { id }, create: { id } } } }, update: {} });'
                )
            ).toEqual(['FlashCardSet']);
            expect(hits('await this.prisma.user.update({ where: { id }, data: { sessions: { deleteMany: {} } } });')).toEqual([]);
            expect(hits('await this.prisma.quizSet.create({ data: { id, userId } });', 'content')).toEqual([]);
        });

        it('a fixture with a relation include exits 1 in strict mode', () => {
            const root = fixture({
                'apps/auth-service/prisma/schema.prisma': schema + '\n',
                'apps/auth-service/src/bad.ts': "export const f = (prisma: any) => prisma.user.findMany({ include: { quizSet: true } });\n",
            });
            try {
                const strict = run(root, '--strict');
                expect(strict.status).toBe(1);
                expect(strict.stdout).toContain('QuizSet is owned by content, accessed from auth');
            } finally {
                rmSync(root, { recursive: true, force: true });
            }
        });
    });
});
