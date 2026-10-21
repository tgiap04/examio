'use strict';
// Run: node --test deploy/rabbitmq/render-definitions.spec.cjs
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { hashPassword, renderDefinitions } = require('./render-definitions.cjs');

const SCRIPT = path.join(__dirname, 'render-definitions.cjs');
const ENV = {
    RABBITMQ_USER: 'ops',
    RABBITMQ_PASS: 'ops-pass',
    RABBITMQ_AUTH_PASS: 'a',
    RABBITMQ_FINANCE_PASS: 'f',
    RABBITMQ_EXAM_PASS: 'e',
    RABBITMQ_AI_PASS: 'i',
    RABBITMQ_GATEWAY_PASS: 'g',
};

test('hashPassword matches the RabbitMQ documentation reference (salt 908DC60A, test12)', () => {
    const salt = Buffer.from('908DC60A', 'hex');
    assert.strictEqual(
        hashPassword('test12', salt),
        'kI3GCqW5JLMJa4iX1lo7X4D6XbYqlLgxIs30+P6tENUV2POR'
    );
});

test('renderDefinitions substitutes users, hashes and the admin name', () => {
    const out = renderDefinitions(
        fs.readFileSync(path.join(__dirname, 'definitions.template.json'), 'utf8'),
        ENV
    );
    const names = out.users.map((u) => u.name).sort();
    assert.deepStrictEqual(names, ['ai', 'auth', 'exam', 'finance', 'gateway', 'ops']);
    assert.ok(out.users.every((u) => u.hashing_algorithm === 'rabbit_password_hashing_sha256'));
    assert.ok(out.users.find((u) => u.name === 'ops').tags.includes('administrator'));
    assert.ok(!JSON.stringify(out).includes('{{'));
    assert.ok(!JSON.stringify(out).includes('ops-pass'));
});

test('finance may publish only ^finance\\. on examio.events and touch only its own queues', () => {
    const out = renderDefinitions(
        fs.readFileSync(path.join(__dirname, 'definitions.template.json'), 'utf8'),
        ENV
    );
    const topic = out.topic_permissions.find((p) => p.user === 'finance');
    assert.strictEqual(topic.exchange, 'examio.events');
    assert.strictEqual(topic.write, '^finance\\.');
    const perm = out.permissions.find((p) => p.user === 'finance');
    const re = new RegExp(perm.configure);
    assert.ok(re.test('examio.events') && re.test('finance.events') && re.test('finance.dlq'));
    assert.ok(!re.test('auth.events') && !re.test('amq.default'));
});

test('gateway may only read examio.events and touch gateway.* queues, and publishes nothing', () => {
    const out = renderDefinitions(
        fs.readFileSync(path.join(__dirname, 'definitions.template.json'), 'utf8'),
        ENV
    );
    const topic = out.topic_permissions.find((p) => p.user === 'gateway');
    assert.strictEqual(topic.exchange, 'examio.events');
    assert.strictEqual(topic.write, '^gateway\\.');
    assert.strictEqual(topic.read, '.*');
    const perm = out.permissions.find((p) => p.user === 'gateway');
    const re = new RegExp(perm.configure);
    assert.ok(re.test('examio.events') && re.test('gateway.events') && re.test('gateway.dlq'));
    assert.ok(!re.test('auth.events') && !re.test('finance.events') && !re.test('amq.default'));
});

test('auth.session.revoked flows auth -> gateway: auth may publish it, the gateway may bind it', () => {
    const out = renderDefinitions(
        fs.readFileSync(path.join(__dirname, 'definitions.template.json'), 'utf8'),
        ENV
    );
    const topic = (user) => out.topic_permissions.find((p) => p.user === user);
    assert.ok(new RegExp(topic('auth').write).test('auth.session.revoked'));
    assert.ok(new RegExp(topic('gateway').read).test('auth.session.revoked'));
    assert.ok(!new RegExp(topic('gateway').write).test('auth.session.revoked'));
});

test('CLI exits 1 when a password is missing and writes nothing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'defs-'));
    const out = path.join(dir, 'definitions.json');
    const env = { ...ENV };
    delete env.RABBITMQ_FINANCE_PASS;
    const res = spawnSync(process.execPath, [SCRIPT, '--out', out], {
        env: { PATH: process.env.PATH, ...env },
        encoding: 'utf8',
    });
    assert.strictEqual(res.status, 1);
    assert.match(res.stderr, /RABBITMQ_FINANCE_PASS/);
    assert.ok(!fs.existsSync(out));
});

test('CLI writes definitions.json (world-readable, the broker user must read the mount) when all passwords are set', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'defs-'));
    const out = path.join(dir, 'definitions.json');
    const res = spawnSync(process.execPath, [SCRIPT, '--out', out], {
        env: { PATH: process.env.PATH, ...ENV },
        encoding: 'utf8',
    });
    assert.strictEqual(res.status, 0, res.stderr);
    assert.strictEqual(JSON.parse(fs.readFileSync(out, 'utf8')).users.length, 6);
    assert.strictEqual(fs.statSync(out).mode & 0o777, 0o644);
});

test('CLI without --out never writes inside the repo tree: default is the OS temp dir', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'defs-default-'));
    const inRepo = path.join(__dirname, 'definitions.json');
    const hadRepoFile = fs.existsSync(inRepo);
    const before = hadRepoFile ? fs.statSync(inRepo).mtimeMs : null;
    const res = spawnSync(process.execPath, [SCRIPT], {
        env: { PATH: process.env.PATH, TMPDIR: tmp, TMP: tmp, TEMP: tmp, ...ENV },
        encoding: 'utf8',
        cwd: tmp,
    });
    assert.strictEqual(res.status, 0, res.stderr);
    const written = path.join(tmp, 'definitions.json');
    assert.ok(fs.existsSync(written), 'default output lands in the temp dir');
    assert.match(res.stdout, new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.strictEqual(fs.existsSync(inRepo), hadRepoFile);
    if (hadRepoFile) assert.strictEqual(fs.statSync(inRepo).mtimeMs, before);
});
