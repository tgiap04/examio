import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const REPO = join(__dirname, '../..');
const DEPCRUISE = join(REPO, 'node_modules/.bin/depcruise');
const CONFIG = join(REPO, '.dependency-cruiser.cjs');

function cruise(files: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), 'depcruise-'));
    mkdirSync(join(root, 'libs'), { recursive: true });
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'commonjs' } }));
    for (const [path, body] of Object.entries(files)) {
        const full = join(root, path);
        mkdirSync(join(full, '..'), { recursive: true });
        writeFileSync(full, body);
    }
    try {
        return spawnSync(DEPCRUISE, ['apps', 'libs', '--config', CONFIG], { cwd: root, encoding: 'utf8' });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

describe('.dependency-cruiser.cjs (fixtures)', () => {
    it('apps/a importing apps/b is an error (exit != 0)', () => {
        const r = cruise({
            'apps/a/src/x.ts': "import { y } from '../../b/src/y';\nexport const x = y;\n",
            'apps/b/src/y.ts': 'export const y = 1;\n',
            'libs/.keep': '',
        });
        expect(r.status).not.toBe(0);
        expect(r.stdout).toContain('no-cross-app-import');
    });

    it('libs importing an app is an error', () => {
        const r = cruise({
            'libs/common/src/l.ts': "import { y } from '../../../apps/b/src/y';\nexport const l = y;\n",
            'apps/b/src/y.ts': 'export const y = 1;\n',
        });
        expect(r.status).not.toBe(0);
        expect(r.stdout).toContain('libs-no-apps');
    });

    it('a cross-app import from a test is an error (harnesses live under test/cross-app)', () => {
        const r = cruise({
            'apps/a/test/h.e2e-spec.ts': "import { y } from '../../b/src/y';\nexport const x = y;\n",
            'apps/b/src/y.ts': 'export const y = 1;\n',
        });
        expect(r.status).not.toBe(0);
        expect(r.stdout).toContain('no-cross-app-import-in-tests');
    });

    it('same-app imports and app -> libs are clean', () => {
        const r = cruise({
            'apps/a/src/x.ts': "import { z } from './z';\nimport { l } from '../../../libs/common/src/l';\nexport const x = z + l;\n",
            'apps/a/src/z.ts': 'export const z = 1;\n',
            'libs/common/src/l.ts': 'export const l = 2;\n',
        });
        expect(r.status).toBe(0);
    });
});
