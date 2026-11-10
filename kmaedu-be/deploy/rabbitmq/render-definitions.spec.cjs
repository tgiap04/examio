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
    RABBITMQ_CONTENT_PASS: 'k',
    RABBITMQ_ASSESSMENT_PASS: 'm',
    RABBITMQ_STUDYROOM_PASS: 's',
    RABBITMQ_AI_PASS: 'i',
    RABBITMQ_DOCUMENT_PASS: 'd',
    RABBITMQ_GATEWAY_PASS: 'g',
    RABBITMQ_AICHAT_PASS: 'c',
};

const render = () =>
    renderDefinitions(fs.readFileSync(path.join(__dirname, 'definitions.template.json'), 'utf8'), ENV);

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
    assert.deepStrictEqual(names, ['ai', 'aichat', 'assessment', 'auth', 'content', 'document', 'gateway', 'ops', 'studyroom']);
    assert.ok(out.users.every((u) => u.hashing_algorithm === 'rabbit_password_hashing_sha256'));
    assert.ok(out.users.find((u) => u.name === 'ops').tags.includes('administrator'));
    assert.ok(!JSON.stringify(out).includes('{{'));
    assert.ok(!JSON.stringify(out).includes('ops-pass'));
});

test('finance-service is gone: no finance user, permission, topic permission or binding', () => {
    const out = render();
    assert.ok(!out.users.some((u) => u.name === 'finance'), 'no finance broker user');
    assert.ok(!out.permissions.some((p) => p.user === 'finance'));
    assert.ok(!out.topic_permissions.some((p) => p.user === 'finance'));
    assert.ok(!JSON.stringify(out).includes('RABBITMQ_FINANCE_PASS'));
    for (const binding of out.bindings) {
        assert.ok(!/^finance\./.test(binding.routing_key || ''), JSON.stringify(binding));
    }
});

test('content may publish only ^content\\. and touch only its own queues; the retired exam user is gone', () => {
    const out = render();
    assert.ok(!out.users.some((u) => u.name === 'exam'), 'no exam broker user');
    assert.ok(!out.permissions.some((p) => p.user === 'exam') && !out.topic_permissions.some((p) => p.user === 'exam'));
    const topic = out.topic_permissions.find((p) => p.user === 'content');
    assert.strictEqual(topic.exchange, 'kmaedu.events');
    assert.strictEqual(topic.write, '^content\\.');
    const re = new RegExp(topic.write);
    assert.ok(re.test('content.generation.requested') && re.test('content.quizset.deleted'));
    for (const key of ['exam.room.created', 'assessment.x', 'ai.generation.completed', 'document.deleted', 'auth.user.updated', 'contentx.y']) {
        assert.ok(!re.test(key), key);
    }
    const perm = out.permissions.find((p) => p.user === 'content');
    for (const field of ['configure', 'write', 'read']) {
        const q = new RegExp(perm[field]);
        for (const name of ['kmaedu.events', 'content.events', 'content.retry.30s', 'content.dlq']) assert.ok(q.test(name), `${field}: ${name}`);
        for (const name of ['assessment.events', 'ai.events', 'document.events', 'exam-service', 'amq.default']) {
            assert.ok(!q.test(name), `${field} must not match ${name}`);
        }
    }
});

test('assessment may publish only ^assessment\\. and touch only its own queues', () => {
    const out = render();
    const topic = out.topic_permissions.find((p) => p.user === 'assessment');
    assert.strictEqual(topic.exchange, 'kmaedu.events');
    assert.strictEqual(topic.write, '^assessment\\.');
    assert.strictEqual(topic.read, '.*');
    const perm = out.permissions.find((p) => p.user === 'assessment');
    for (const field of ['configure', 'write', 'read']) {
        const q = new RegExp(perm[field]);
        for (const name of ['kmaedu.events', 'assessment.events', 'assessment.retry.30s', 'assessment.dlq']) {
            assert.ok(q.test(name), `${field}: ${name}`);
        }
        for (const name of ['content.events', 'auth.events', 'exam-service', 'amq.default']) {
            assert.ok(!q.test(name), `${field} must not match ${name}`);
        }
    }
});

test('content.quizset.deleted flows content -> assessment: content publishes it, assessment binds it and cannot forge it', () => {
    const out = render();
    const topic = (user) => out.topic_permissions.find((p) => p.user === user);
    for (const key of ['content.quizset.deleted']) {
        assert.ok(new RegExp(topic('content').write).test(key));
        assert.ok(new RegExp(topic('assessment').read).test(key));
        assert.ok(!new RegExp(topic('assessment').write).test(key));
    }
});

test('studyroom may publish only ^studyroom\\. on kmaedu.events and touch only its own queues', () => {
    const out = renderDefinitions(
        fs.readFileSync(path.join(__dirname, 'definitions.template.json'), 'utf8'),
        ENV
    );
    const topic = out.topic_permissions.find((p) => p.user === 'studyroom');
    assert.strictEqual(topic.exchange, 'kmaedu.events');
    assert.strictEqual(topic.write, '^studyroom\\.');
    const perm = out.permissions.find((p) => p.user === 'studyroom');
    const re = new RegExp(perm.configure);
    for (const q of ['kmaedu.events', 'studyroom.events', 'studyroom.retry.30s', 'studyroom.dlq']) {
        assert.ok(re.test(q), q);
    }
    assert.ok(!re.test('content.events') && !re.test('amq.default'));
});

test('gateway may only read kmaedu.events and touch gateway.* queues, and publishes nothing', () => {
    const out = renderDefinitions(
        fs.readFileSync(path.join(__dirname, 'definitions.template.json'), 'utf8'),
        ENV
    );
    const topic = out.topic_permissions.find((p) => p.user === 'gateway');
    assert.strictEqual(topic.exchange, 'kmaedu.events');
    assert.strictEqual(topic.write, '^gateway\\.');
    assert.strictEqual(topic.read, '.*');
    const perm = out.permissions.find((p) => p.user === 'gateway');
    const re = new RegExp(perm.configure);
    assert.ok(re.test('kmaedu.events') && re.test('gateway.events') && re.test('gateway.dlq'));
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

test('document may publish only ^document\\. on kmaedu.events and touch only its own queues', () => {
    const out = render();
    const topic = out.topic_permissions.find((p) => p.user === 'document');
    assert.strictEqual(topic.exchange, 'kmaedu.events');
    assert.strictEqual(topic.write, '^document\\.');
    const perm = out.permissions.find((p) => p.user === 'document');
    for (const field of ['configure', 'write', 'read']) {
        const re = new RegExp(perm[field]);
        for (const q of ['kmaedu.events', 'document.events', 'document.retry.30s', 'document.dlq']) {
            assert.ok(re.test(q), `${field}: ${q}`);
        }
        assert.ok(!re.test('ai.events') && !re.test('ai.retry.30s') && !re.test('content.events') && !re.test('amq.default'), field);
    }
});

test('ai may publish only ^ai\\. and read only ai.events (+ retry/DLQ): the legacy ai-service-queue is gone', () => {
    const out = render();
    const topic = out.topic_permissions.find((p) => p.user === 'ai');
    assert.strictEqual(topic.write, '^ai\\.');
    assert.ok(!new RegExp(topic.write).test('document.uploaded'));
    const perm = out.permissions.find((p) => p.user === 'ai');
    for (const field of ['configure', 'write', 'read']) {
        const re = new RegExp(perm[field]);
        for (const q of ['kmaedu.events', 'ai.events', 'ai.retry.30s', 'ai.dlq']) assert.ok(re.test(q), `${field}: ${q}`);
        assert.ok(!re.test('document.events') && !re.test('ai-service-queue') && !re.test('content.events'), field);
    }
});

test('document events flow ai <-> document: each side may publish its own keys and bind the other\'s', () => {
    const out = render();
    const topic = (user) => out.topic_permissions.find((p) => p.user === user);
    for (const key of ['document.uploaded', 'document.deleted']) {
        assert.ok(new RegExp(topic('document').write).test(key), `document publishes ${key}`);
        assert.ok(new RegExp(topic('ai').read).test(key), `ai binds ${key}`);
        assert.ok(!new RegExp(topic('ai').write).test(key), `ai must not publish ${key}`);
    }
    for (const key of ['ai.document.processed', 'ai.document.failed']) {
        assert.ok(new RegExp(topic('ai').write).test(key), `ai publishes ${key}`);
        assert.ok(new RegExp(topic('document').read).test(key), `document binds ${key}`);
        assert.ok(!new RegExp(topic('document').write).test(key), `document must not publish ${key}`);
    }
});

test('aichat reads only its own queues and the events exchange, and may publish nothing it consumes', () => {
    const out = render();
    const topic = out.topic_permissions.find((p) => p.user === 'aichat');
    assert.strictEqual(topic.exchange, 'kmaedu.events');
    assert.strictEqual(topic.write, '^aichat\\.');
    assert.strictEqual(topic.read, '.*');
    const perm = out.permissions.find((p) => p.user === 'aichat');
    for (const field of ['configure', 'write', 'read']) {
        const re = new RegExp(perm[field]);
        for (const q of ['kmaedu.events', 'aichat.events', 'aichat.retry.30s', 'aichat.dlq']) {
            assert.ok(re.test(q), `${field}: ${q}`);
        }
        for (const q of ['ai.events', 'auth.events', 'content.events', 'document.events', 'amq.default']) {
            assert.ok(!re.test(q), `${field} must not match ${q}`);
        }
    }
});

test('aichat consumes document.deleted and does not publish it', () => {
    const out = render();
    const topic = (user) => out.topic_permissions.find((p) => p.user === user);
    for (const [key, publisher] of [['document.deleted', 'document']]) {
        assert.ok(new RegExp(topic(publisher).write).test(key), `${publisher} publishes ${key}`);
        assert.ok(new RegExp(topic('aichat').read).test(key), `aichat binds ${key}`);
        assert.ok(!new RegExp(topic('aichat').write).test(key), `aichat must not publish ${key}`);
    }
});

test('CLI exits 1 when a password is missing and writes nothing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'defs-'));
    const out = path.join(dir, 'definitions.json');
    const env = { ...ENV };
    delete env.RABBITMQ_AICHAT_PASS;
    const res = spawnSync(process.execPath, [SCRIPT, '--out', out], {
        env: { PATH: process.env.PATH, ...env },
        encoding: 'utf8',
    });
    assert.strictEqual(res.status, 1);
    assert.match(res.stderr, /RABBITMQ_AICHAT_PASS/);
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
    assert.strictEqual(JSON.parse(fs.readFileSync(out, 'utf8')).users.length, 9);
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
