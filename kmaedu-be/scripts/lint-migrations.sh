#!/usr/bin/env bash
# Expand/contract guard for database migrations (PR workflow).
#   scripts/lint-migrations.sh <base> <head>
# Scans the migration files ADDED in <base>..<head>:
#   apps/*/prisma/migrations/*/migration.sql   (Prisma)
#   apps/ai-service/alembic/versions/*.py      (Alembic)
# and fails (exit 1) on a destructive or breaking change, because the previous image of every
# service keeps running during a rolling deploy and must still work against the new schema:
#   SQL     DROP TABLE|COLUMN|TYPE|SCHEMA, RENAME, ALTER COLUMN .. [SET DATA] TYPE, ALTER TYPE,
#           SET NOT NULL, ADD COLUMN .. NOT NULL without DEFAULT
#   Alembic op.drop_* (except drop_index / drop_constraint), op.rename_*,
#           op.alter_column(.. type_= | nullable=False | new_column_name=),
#           op.add_column(.. nullable=False) without server_default, plus the SQL rules on any raw SQL
# DROP INDEX|DEFAULT|NOT NULL|CONSTRAINT are expand-safe and pass.
#
# Env
#   MIGRATION_CONTRACT=1  skip the check (CI sets it from the PR label `migration:contract`);
#                         the contract PR is the second PR of the two-PR flow (deploy/README.md).
#   CHANGED_FILES         newline-separated added files, instead of `git diff --diff-filter=A`
#   LINT_ROOT             directory the paths resolve against (default: kmaedu-be/); for fixtures
# Files are read from the working tree, which in CI is the PR head.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
base="${1:-}"
head="${2:-HEAD}"
root="${LINT_ROOT:-$here/..}"

if [ "${MIGRATION_CONTRACT:-}" = "1" ]; then
    echo "lint-migrations: MIGRATION_CONTRACT=1 (label migration:contract), check skipped"
    exit 0
fi

if [ -n "${CHANGED_FILES+x}" ]; then
    files="$CHANGED_FILES"
elif [ -z "$base" ] || ! git -C "$here" rev-parse --verify --quiet "${base}^{commit}" >/dev/null \
    || ! git -C "$here" rev-parse --verify --quiet "${head}^{commit}" >/dev/null; then
    echo "lint-migrations: cannot resolve '$base'..'$head'; refusing to pass without a diff" >&2
    exit 2
else
    files="$(git -C "$here" diff --name-only --diff-filter=A "$base" "$head")"
fi

command -v node >/dev/null 2>&1 || { echo "lint-migrations.sh: node is required" >&2; exit 2; }

LINT_ROOT_DIR="$root" CHANGED_LIST="$files" node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const root = process.env.LINT_ROOT_DIR;
const isSql = (f) => /^apps\/[^/]+\/prisma\/migrations\/[^/]+\/migration\.sql$/.test(f);
const isAlembic = (f) => /^apps\/ai-service\/alembic\/versions\/[^/]+\.py$/.test(f);

const files = process.env.CHANGED_LIST.split('\n')
    .map((f) => f.trim().replace(/^kmaedu-be\//, ''))
    .filter((f) => isSql(f) || isAlembic(f));

// Blank out comments (and, for SQL, string literals) but keep newlines so line numbers hold.
const blank = (m) => m.replace(/[^\n]/g, ' ');
const stripSql = (t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/--[^\n]*/g, blank).replace(/'(?:[^']|'')*'/g, blank);
const stripPy = (t) => t.replace(/#[^\n]*/g, blank);

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// Text of a call starting at `open` (index of "("), by balanced parentheses.
const callBody = (text, open) => {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '(') depth++;
        else if (text[i] === ')' && --depth === 0) return text.slice(open, i + 1);
    }
    return text.slice(open);
};

const SQL_RULES = [
    [/\bdrop\s+(table|column|type|schema)\b/gi, 'DROP TABLE/COLUMN/TYPE/SCHEMA'],
    [/\brename\b/gi, 'RENAME'],
    [/\balter\s+column\s+\S+\s+(set\s+data\s+)?type\b/gi, 'ALTER COLUMN .. TYPE'],
    [/\balter\s+type\b/gi, 'ALTER TYPE'],
    [/\bset\s+not\s+null\b/gi, 'SET NOT NULL'],
];

function lintSql(text, found) {
    for (const [re, label] of SQL_RULES) {
        for (const m of text.matchAll(re)) found.push([lineOf(text, m.index), label]);
    }
    // ADD COLUMN .. NOT NULL needs a DEFAULT; clauses of one ALTER TABLE are comma-separated.
    let offset = 0;
    for (const stmt of text.split(';')) {
        let pos = 0;
        for (const clause of stmt.split(/,\s*(?=add\s|drop\s|alter\s)/i)) {
            const at = stmt.indexOf(clause, pos);
            pos = at + clause.length;
            const i = clause.search(/\badd\s+column\b/i);
            if (i < 0) continue;
            const col = clause.slice(i);
            if (/\bnot\s+null\b/i.test(col) && !/\bdefault\b/i.test(col)) {
                found.push([lineOf(text, offset + at + i), 'ADD COLUMN .. NOT NULL without DEFAULT']);
            }
        }
        offset += stmt.length + 1;
    }
}

function lintAlembic(text, found) {
    lintSql(text, found); // raw SQL inside op.execute(...)
    for (const m of text.matchAll(/\bop\.(drop_\w+|rename_\w+)\s*\(/g)) {
        if (m[1] === 'drop_index' || m[1] === 'drop_constraint') continue;
        found.push([lineOf(text, m.index), `op.${m[1]}`]);
    }
    for (const m of text.matchAll(/\bop\.alter_column\s*\(/g)) {
        const body = callBody(text, m.index + m[0].length - 1);
        if (/\btype_\s*=|\bnullable\s*=\s*False\b|\bnew_column_name\s*=/.test(body)) {
            found.push([lineOf(text, m.index), 'op.alter_column(type_ / nullable=False / new_column_name)']);
        }
    }
    for (const m of text.matchAll(/\bop\.add_column\s*\(/g)) {
        const body = callBody(text, m.index + m[0].length - 1);
        if (/\bnullable\s*=\s*False\b/.test(body) && !/\bserver_default\s*=/.test(body)) {
            found.push([lineOf(text, m.index), 'op.add_column(nullable=False) without server_default']);
        }
    }
}

let failed = 0;
for (const f of files) {
    const abs = path.join(root, f);
    let raw;
    try {
        raw = fs.readFileSync(abs, 'utf8');
    } catch (err) {
        console.error(`lint-migrations: cannot read ${f}: ${err.message}`);
        process.exit(2);
    }
    const found = [];
    if (isSql(f)) lintSql(stripSql(raw), found);
    else lintAlembic(stripPy(raw), found);
    const seen = new Set();
    for (const [line, label] of found.sort((a, b) => a[0] - b[0])) {
        const key = `${line}:${label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        console.error(`${f}:${line}: ${label}`);
        failed++;
    }
}

if (failed > 0) {
    console.error(
        `lint-migrations: ${failed} breaking change(s). Ship the expand migration first; a drop/rename/retype ` +
            'goes in a second PR labelled migration:contract (deploy/README.md).',
    );
    process.exit(1);
}
console.log(`lint-migrations: ${files.length} migration file(s) checked, all expand-safe`);
NODE
