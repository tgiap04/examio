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
        expect(delegateOf('WalletTransaction')).toBe('walletTransaction');
    });

    it('flags a foreign model access and accepts an owned or shared one', () => {
        const code = [
            'await this.prisma.wallet.findUnique({});',
            'await tx.user.update({});',
            'await tx.outboxEvent.create({});',
            '// this.prisma.payment.count()',
        ].join('\n');
        const v = scanSource(code, 'apps/admin-service/src/x.ts', 'admin');
        expect(v.map((x) => [x.model, x.owner, x.app, x.line])).toEqual([
            ['Wallet', 'finance', 'admin', 1],
            ['User', 'auth', 'admin', 2],
        ]);
    });

    it('catches the repository modelName idiom', () => {
        const v = scanSource("protected modelName = 'walletTransaction';", 'apps/assessment-service/src/r.ts', 'assessment');
        expect(v).toHaveLength(1);
        expect(v[0]).toMatchObject({ model: 'WalletTransaction', owner: 'finance' });
    });

    it('a fixture violation exits 1 in strict mode and 0 in report mode', () => {
        const root = fixture({
            'apps/admin-service/src/bad.ts': 'export const f = (prisma: any) => prisma.wallet.findMany();\n',
            'apps/finance-service/src/ok.ts': 'export const g = (prisma: any) => prisma.wallet.findMany();\n',
        });
        try {
            const strict = run(root, '--strict');
            expect(strict.status).toBe(1);
            expect(strict.stdout).toContain('apps/admin-service/src/bad.ts:1  Wallet is owned by finance, accessed from admin');
            expect(strict.stdout).not.toContain('ok.ts');
            expect(run(root).status).toBe(0);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('a clean fixture exits 0 in strict mode; spec files are ignored', () => {
        const root = fixture({
            'apps/finance-service/src/ok.ts': 'export const g = (prisma: any) => prisma.wallet.findMany();\n',
            'apps/admin-service/src/x.spec.ts': 'prisma.wallet.findMany();\n',
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
            '  wallet Wallet?',
            '  subscription UserSubscription?',
            '  sessions UserSession[]',
            '}',
            'model Wallet {',
            '  id String @id',
            '  user User @relation(fields: [userId], references: [id])',
            '  userId String',
            '  transactions WalletTransaction[]',
            '}',
            'model UserSession { id String @id }',
            'model UserSubscription { id String @id }',
            'model WalletTransaction { id String @id }',
        ].join('\n');
        const relations = relationMap(schema);

        it('parses relation fields (field -> target model), ignoring scalars', () => {
            expect(relations.get('User')?.get('wallet')).toBe('Wallet');
            expect(relations.get('User')?.get('sessions')).toBe('UserSession');
            expect(relations.get('User')?.has('id')).toBe(false);
        });

        it('flags include of a foreign relation (auth reading wallet/subscription through User)', () => {
            const code = [
                'await this.prisma.user.findFirst({',
                '    where: { id },',
                '    include: { wallet: { select: { balance: true } }, subscription: true, sessions: true },',
                '});',
            ].join('\n');
            const v = scanSource(code, 'apps/auth-service/src/r.ts', 'auth', relations);
            expect(v.map((x) => [x.model, x.owner, x.app, x.line])).toEqual([
                ['Wallet', 'finance', 'auth', 1],
                ['UserSubscription', 'finance', 'auth', 1],
            ]);
        });

        it('flags a foreign relation inside select, nested includes, and accepts own relations', () => {
            const code = [
                'await this.prisma.user.findUnique({ where: { id }, select: { id: true, wallet: { select: { transactions: true } } } });',
                'await this.prisma.user.findMany({ include: { sessions: true } });',
            ].join('\n');
            const v = scanSource(code, 'apps/admin-service/src/r.ts', 'auth', relations);
            expect(v.map((x) => x.model)).toEqual(['Wallet', 'WalletTransaction']);
        });

        it('without a schema the relation check is skipped (backward compatible)', () => {
            const code = 'await this.prisma.user.findMany({ include: { wallet: true } });';
            expect(scanSource(code, 'apps/auth-service/src/r.ts', 'auth')).toEqual([]);
        });

        const hits = (code: string, app: 'auth' | 'finance' | 'admin' = 'auth') =>
            scanSource(code, `apps/${app}-service/src/r.ts`, app, relations).map((x) => x.model);

        it('flags a relation filter in where (plain, and/or/not, is/some wrappers) and in orderBy', () => {
            expect(hits('await this.prisma.user.findMany({ where: { wallet: { balance: { gt: 0 } } } });')).toEqual(['Wallet']);
            expect(
                hits('await this.prisma.user.findMany({ where: { OR: [{ id }, { NOT: { wallet: { is: { balance: 0 } } } }] } });')
            ).toEqual(['Wallet']);
            expect(
                hits('await this.prisma.wallet.findMany({ where: { user: { email: { contains: q } } } });', 'finance')
            ).toEqual(['User']);
            expect(hits('await this.prisma.user.findMany({ orderBy: { wallet: { balance: "desc" } } });')).toEqual(['Wallet']);
            expect(hits('await this.prisma.user.findMany({ orderBy: [{ subscription: { tier: "asc" } }] });')).toEqual([
                'UserSubscription',
            ]);
        });

        it('accepts own relations and scalar filters in where/orderBy', () => {
            expect(
                hits('await this.prisma.user.findMany({ where: { sessions: { some: { id } }, id: { in: ids } }, orderBy: { id: "asc" } });')
            ).toEqual([]);
            expect(hits('await this.prisma.wallet.findMany({ where: { userId } });', 'finance')).toEqual([]);
        });

        it('follows include/select/where passed through a same-file const or a spread', () => {
            const viaConst = [
                'const withWallet = { wallet: { select: { balance: true } } };',
                'await this.prisma.user.findMany({ include: withWallet });',
            ].join('\n');
            expect(hits(viaConst)).toEqual(['Wallet']);
            const viaSpread = [
                'const base = { include: { subscription: true } } as const;',
                'await this.prisma.user.findFirst({ where: { id }, ...base });',
            ].join('\n');
            expect(hits(viaSpread)).toEqual(['UserSubscription']);
            const viaArgs = [
                'const args = { where: { wallet: { is: {} } } };',
                'await this.prisma.user.findMany(args);',
            ].join('\n');
            expect(hits(viaArgs)).toEqual(['Wallet']);
            const own = ['const inc = { sessions: true };', 'await this.prisma.user.findMany({ include: inc });'].join('\n');
            expect(hits(own)).toEqual([]);
        });

        it('flags nested writes (connect / create / connectOrCreate) on a foreign relation', () => {
            expect(
                hits('await this.prisma.wallet.create({ data: { id, user: { connect: { id: userId } } } });', 'finance')
            ).toEqual(['User']);
            expect(hits('await this.prisma.user.update({ where: { id }, data: { wallet: { create: { id: w } } } });')).toEqual([
                'Wallet',
            ]);
            expect(
                hits(
                    'await this.prisma.user.upsert({ where: { id }, create: { subscription: { connectOrCreate: { where: { id }, create: { id } } } }, update: {} });'
                )
            ).toEqual(['UserSubscription']);
            expect(hits('await this.prisma.user.update({ where: { id }, data: { sessions: { deleteMany: {} } } });')).toEqual([]);
            expect(hits('await this.prisma.wallet.create({ data: { id, userId } });', 'finance')).toEqual([]);
        });

        it('a fixture with a relation include exits 1 in strict mode', () => {
            const root = fixture({
                'apps/auth-service/prisma/schema.prisma': schema + '\n',
                'apps/auth-service/src/bad.ts': "export const f = (prisma: any) => prisma.user.findMany({ include: { wallet: true } });\n",
            });
            try {
                const strict = run(root, '--strict');
                expect(strict.status).toBe(1);
                expect(strict.stdout).toContain('Wallet is owned by finance, accessed from auth');
            } finally {
                rmSync(root, { recursive: true, force: true });
            }
        });
    });
});
