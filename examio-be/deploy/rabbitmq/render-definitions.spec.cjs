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
    assert.deepStrictEqual(names, ['ai', 'auth', 'exam', 'finance', 'ops']);
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
    assert.strictEqual(JSON.parse(fs.readFileSync(out, 'utf8')).users.length, 5);
    assert.strictEqual(fs.statSync(out).mode & 0o777, 0o644);
});
