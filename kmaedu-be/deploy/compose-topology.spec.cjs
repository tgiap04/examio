'use strict';
// Run: node --test deploy/compose-topology.spec.cjs
// Static check of the compose stack (no docker needed): docker-compose.yml only
// `include:`s deploy/compose/*.yml, so the services are merged here the same way
// Compose does. Covers network segmentation and published ports (RT-2) and the
// database-per-service wiring (phase 11).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('yaml');

const readYaml = (file) => parse(fs.readFileSync(file, 'utf8'), { merge: true });
const top = readYaml(path.join(__dirname, 'docker-compose.yml'));
const includedPaths = (top.include ?? []).map((i) => (typeof i === 'string' ? i : i.path));
const parts = includedPaths.map((rel) => readYaml(path.join(__dirname, rel)));
const compose = {
    networks: Object.assign({}, top.networks, ...parts.map((p) => p.networks ?? {})),
    services: Object.assign({}, top.services, ...parts.map((p) => p.services ?? {})),
};
const services = compose.services;
const DB_SERVICES = ['auth', 'admin', 'content', 'assessment'];
const ROLES = 'auth admin content assessment studyroom vocabulary aichat document ai'.split(' ');
// Compose accepts `environment` as a list (`K=V`) or a map (`K: V`); the ai services use the map form.
const envList = (name) => {
    const env = services[name].environment ?? [];
    return Array.isArray(env) ? env : Object.entries(env).map(([key, value]) => `${key}=${value ?? ''}`);
};
const envValue = (name, key) => {
    const hit = envList(name).find((e) => e.startsWith(`${key}=`));
    return hit === undefined ? undefined : hit.slice(key.length + 1);
};
// `networks` is a list, or a map when a service sets aliases on one of them.
const networksOf = (name) => {
    const nets = services[name].networks ?? [];
    return Array.isArray(nets) ? nets : Object.keys(nets);
};
const members = (network) =>
    Object.keys(services)
        .filter((n) => networksOf(n).includes(network))
        .sort();

test('postgres, redis and rabbitmq publish no host port', () => {
    for (const name of ['postgres', 'redis', 'rabbitmq']) {
        assert.strictEqual(services[name].ports, undefined, `${name} must not publish ports`);
    }
});

test('no service publishes a host port: the only way in is the FE nginx on edge (phase 16)', () => {
    const published = Object.keys(services).filter((n) => services[n].ports);
    assert.deepStrictEqual(published, []);
});

test('no service publishes on 0.0.0.0: every published port is bound to loopback', () => {
    for (const [name, service] of Object.entries(services)) {
        for (const port of service.ports ?? []) {
            const spec = typeof port === 'string' ? port : `${port.host_ip ?? ''}:${port.published}:${port.target}`;
            assert.match(spec, /^(127\.0\.0\.1|\[?::1\]?):/, `${name} publishes "${spec}" on all interfaces`);
        }
    }
});

test('postgres, redis and rabbitmq are on the internal network only', () => {
    for (const name of ['postgres', 'redis', 'rabbitmq']) {
        assert.deepStrictEqual(networksOf(name), ['internal'], name);
    }
});

test('edge carries the two gateway instances (the FE nginx joins it from its own compose)', () => {
    assert.deepStrictEqual(members('edge'), ['gateway-a', 'gateway-b']);
});

test('finance-service is gone: no finance container, migrate one-shot, gateway upstream, broker or DB password', () => {
    for (const name of ['finance', 'finance-migrate']) assert.strictEqual(services[name], undefined, name);
    assert.ok(!includedPaths.includes('compose/finance.yml'));
    for (const [name, svc] of Object.entries(services)) {
        assert.strictEqual(svc.depends_on?.finance, undefined, `${name} waits for finance`);
        for (const key of ['FINANCE_GRPC_URL', 'FINANCE_SERVICE_URL', 'FINANCE_DB_PASSWORD', 'RABBITMQ_FINANCE_PASS', 'FINANCE_DATABASE_URL']) {
            assert.strictEqual(envValue(name, key), undefined, `${name}: ${key}`);
        }
    }
    assert.ok(!fs.readFileSync(path.join(__dirname, 'postgres/init/01-service-schemas.sh'), 'utf8').includes('finance'));
    assert.ok(!fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8').includes('FINANCE'));
});

test('egress is exactly the services with a real internet dependency', () => {
    assert.deepStrictEqual(members('egress'), ['ai', 'ai-worker', 'assessment', 'auth', 'content', 'r2']);
});

test('every networked service is on internal, and admin has no way out', () => {
    for (const name of Object.keys(services)) {
        if (services[name].network_mode === 'none') continue;
        assert.ok(networksOf(name).includes('internal'), `${name} must be on internal`);
    }
    assert.deepStrictEqual(networksOf('admin'), ['internal']);
});

test('the internal network has no route out; names are stable for the FE compose', () => {
    assert.strictEqual(compose.networks.internal.internal, true);
    assert.strictEqual(compose.networks.edge.name, 'kmaedu-edge');
    assert.strictEqual(compose.networks.internal.name, 'kmaedu-internal');
    assert.strictEqual(compose.networks.egress.name, 'kmaedu-egress');
    assert.strictEqual(compose.networks['kmaedu-network'], undefined);
});

test('the gateway has no database: no DATABASE_URL, no postgres/migrate dependency', () => {
    const env = services['gateway-a'].environment.map((e) => e.split('=')[0]);
    assert.ok(!env.includes('DATABASE_URL'));
    assert.ok(!('postgres' in services['gateway-a'].depends_on));
    assert.ok(!Object.keys(services['gateway-a'].depends_on).some((d) => d.endsWith('-migrate')));
    assert.ok(env.includes('RABBITMQ_URL') && env.includes('GRPC_PORT'));
});

test('auth reaches the gateway control plane by default', () => {
    const env = services.auth.environment.join('\n');
    assert.match(env, /GATEWAY_CONTROL_ENABLED=\$\{GATEWAY_CONTROL_ENABLED:-true\}/);
    assert.match(env, /GATEWAY_GRPC_URL=gateway:50051/);
});

test('auth knows R2_PUBLIC_URL: a replaced avatar/banner is queued for deletion and a foreign R2 URL is refused', () => {
    // Without it ownedR2KeyFromUrl / isForeignR2Url see no R2 host: old images stay in R2 forever.
    assert.strictEqual(envValue('auth', 'R2_PUBLIC_URL'), '${R2_PUBLIC_URL:-}');
});

test('no service sets an env var that no code reads', () => {
    const dead = ['AI_FREE_MODE', 'THROTTLE_ADMIN_LIMIT', 'TUTOR_FAST_RETRIEVAL_TIMEOUT_SECONDS'];
    for (const name of Object.keys(services)) {
        for (const key of dead) assert.strictEqual(envValue(name, key), undefined, `${name} sets ${key}`);
    }
});

test('every compose file is included and defines at least one service', () => {
    assert.ok(includedPaths.length >= 8, 'docker-compose.yml must include the per-service files');
    for (const rel of includedPaths) {
        assert.ok(fs.existsSync(path.join(__dirname, rel)), `${rel} is included but missing`);
    }
    for (const part of parts) assert.ok(Object.keys(part.services ?? {}).length > 0);
});

test('the single kmaedu-migration container is gone', () => {
    assert.strictEqual(services.migration, undefined);
    assert.ok(!fs.existsSync(path.join(__dirname, 'entrypoint-migration.sh')));
});

test('each database service has a <svc>-migrate one-shot its API waits for', () => {
    for (const svc of DB_SERVICES) {
        const migrate = services[`${svc}-migrate`];
        assert.ok(migrate, `${svc}-migrate is missing`);
        assert.strictEqual(migrate.restart, 'no');
        assert.strictEqual(migrate.build.args.SERVICE, `${svc}-service`);
        assert.strictEqual(
            services[svc].depends_on[`${svc}-migrate`].condition,
            'service_completed_successfully',
        );
        assert.deepStrictEqual(networksOf(`${svc}-migrate`), ['internal']);
    }
});

test('each service connects as its own role and schema; nobody uses the superuser URL', () => {
    for (const svc of DB_SERVICES) {
        for (const name of [svc, `${svc}-migrate`]) {
            const url = envValue(name, 'DATABASE_URL');
            assert.ok(url, `${name} has no DATABASE_URL`);
            assert.ok(url.startsWith(`postgresql://${svc}_svc:`), `${name} must connect as ${svc}_svc`);
            assert.ok(url.includes(`\${${svc.toUpperCase()}_DB_PASSWORD:?`), `${name} must use its own password`);
            assert.ok(url.endsWith(`?schema=${svc}`), `${name} must target schema ${svc}`);
        }
    }
    for (const name of Object.keys(services)) {
        assert.ok(
            !envList(name).some((e) => e === 'DATABASE_URL=${DATABASE_URL}'),
            `${name} must not reuse a shared DATABASE_URL`,
        );
    }
});

test('ai-service uses ai_svc on its own schema `ai` (pinned search_path, no runtime DDL) behind its own migrate one-shot', () => {
    for (const name of ['ai', 'ai-worker', 'ai-migrate']) {
        const url = envValue(name, 'DATABASE_URL');
        assert.ok(url.startsWith('postgresql://ai_svc:'), `${name} must connect as ai_svc`);
        assert.ok(url.includes('${AI_DB_PASSWORD:?'), `${name} must use its own password`);
        assert.ok(!url.includes('?schema='), 'asyncpg would forward ?schema= as a server setting');
        assert.strictEqual(envValue(name, 'DB_SEARCH_PATH'), 'ai,extensions', name);
        assert.strictEqual(envValue(name, 'AI_RUNTIME_DDL'), undefined, `${name}: the runtime DDL flag is gone`);
    }
    assert.strictEqual(envValue('ai-migrate', 'ROLE'), 'migrate');
    assert.strictEqual(services['ai-migrate'].restart, 'no');
    for (const name of ['ai', 'ai-worker']) {
        assert.strictEqual(services[name].depends_on['ai-migrate'].condition, 'service_completed_successfully', name);
        assert.strictEqual(services[name].depends_on['exam-migrate'], undefined, `${name} no longer waits for exam tables`);
        assert.strictEqual(services[name].depends_on['content-migrate'], undefined, `${name} reads no content tables`);
    }
    assert.strictEqual(envValue('ai', 'ROLE'), 'api');
    assert.strictEqual(envValue('ai-worker', 'ROLE'), 'worker');
    assert.strictEqual(envValue('ai', 'GRPC_PORT'), '50051');
    // the broker user `ai` belongs to the worker (consumer + outbox relay); the gRPC role has no broker URL
    assert.ok(envValue('ai-worker', 'RABBITMQ_URL').startsWith('amqp://ai:${RABBITMQ_AI_PASS:?'));
    assert.strictEqual(envValue('ai', 'RABBITMQ_URL'), undefined);
});

test('r2 has no database and no migrate dependency', () => {
    assert.ok(!envList('r2').some((e) => e.startsWith('DATABASE_URL=')));
    assert.ok(!Object.keys(services.r2.depends_on ?? {}).some((d) => d.endsWith('-migrate')));
});

test('postgres mounts the init dir, raises max_connections and takes all 9 role passwords', () => {
    const pg = services.postgres;
    assert.ok(pg.volumes.includes('./postgres/init:/docker-entrypoint-initdb.d:ro'));
    assert.ok(pg.command.join(' ').includes('max_connections=200'));
    for (const role of ROLES) {
        const key = `${role.toUpperCase()}_DB_PASSWORD`;
        assert.ok(envList('postgres').some((e) => e.startsWith(`${key}=`)), `postgres is missing ${key}`);
    }
    const init = fs.readFileSync(path.join(__dirname, 'postgres/init/01-service-schemas.sh'), 'utf8');
    for (const role of ROLES) assert.ok(init.includes(role), `init script does not know ${role}`);
});

test('the temporary ai_svc grant on the exam schema is gone from the init script (phase 15)', () => {
    const init = fs.readFileSync(path.join(__dirname, 'postgres/init/01-service-schemas.sh'), 'utf8');
    assert.ok(!/GRANT[^;]*\bai_svc\b/i.test(init), 'no GRANT to ai_svc');
    assert.ok(!/ALTER DEFAULT PRIVILEGES/i.test(init), 'no default privileges on exam tables');
    assert.ok(!/GRANT[^;]*SCHEMA exam\b/i.test(init), 'no grant on the exam schema');
    assert.ok(!/\bexam\b/.test(init.split('\n').filter((l) => l.startsWith('SVCS=')).join('')), 'the exam schema is not created any more');
});

test('the exam service is gone from the stack: no service, no migrate, no broker password, no schema, no URL', () => {
    assert.strictEqual(services.exam, undefined);
    assert.strictEqual(services['exam-migrate'], undefined);
    assert.ok(!fs.existsSync(path.join(__dirname, 'compose/exam.yml')));
    assert.ok(!fs.existsSync(path.join(__dirname, 'env/exam.env.example')));
    assert.ok(!includedPaths.some((p) => /exam\.yml$/.test(p)));
    for (const name of Object.keys(services)) {
        assert.ok(!envList(name).some((e) => /^(EXAM_|RABBITMQ_EXAM_)|=.*(exam_svc|schema=exam\b|http:\/\/exam:)/.test(e)), `${name} still references exam`);
        for (const dep of Object.keys(services[name].depends_on ?? {})) assert.ok(!/^exam(-|$)/.test(dep), `${name} depends on ${dep}`);
    }
    const example = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');
    assert.ok(!/^(EXAM_|RABBITMQ_EXAM_)/m.test(example), 'deploy/.env.example still lists exam variables');
});

test('content runs api+worker: it relays the outbox (content.*), settles generation jobs, serves ContentService on gRPC, egress for Turnstile', () => {
    const svc = services.content;
    assert.strictEqual(svc.build.args.SERVICE, 'content-service');
    assert.strictEqual(envValue('content', 'ROLE'), 'api,worker');
    assert.strictEqual(envValue('content', 'GRPC_PORT'), '50051');
    assert.ok(envValue('content', 'RABBITMQ_URL').startsWith('amqp://content:${RABBITMQ_CONTENT_PASS:?'), 'the relay publishes as the broker user content');
    assert.ok(envList('rabbitmq-defs').some((e) => e.startsWith('RABBITMQ_CONTENT_PASS=')), 'the broker definitions need the content password');
    assert.strictEqual(envValue('content', 'FINANCE_GRPC_URL'), undefined, 'generation is free: no finance wiring');
    assert.strictEqual(envValue('content', 'DOCUMENT_GRPC_URL'), 'document:50051');
    assert.strictEqual(envValue('content', 'R2_GRPC_URL'), 'r2:50051');
    assert.strictEqual(envValue('content', 'VOCABULARY_GRPC_URL'), 'vocabulary:50051');
    assert.strictEqual(envValue('content', 'AUTH_GRPC_URL'), 'auth:50051');
    assert.strictEqual(envValue('content', 'AI_GRPC_URL'), 'ai:50051');
    assert.ok(envValue('content', 'R2_PUBLIC_URL') !== undefined);
    assert.ok(envValue('content', 'SERVICE_CLIENT_SECRET').includes('${CONTENT_SERVICE_CLIENT_SECRET:?'));
    assert.deepStrictEqual(networksOf('content'), ['internal', 'egress']);
    for (const dep of ['content-migrate', 'postgres', 'redis', 'rabbitmq', 'r2']) {
        assert.ok(svc.depends_on[dep], `content waits for ${dep}`);
    }
    for (const lazy of ['vocabulary', 'document', 'ai', 'auth']) {
        assert.strictEqual(svc.depends_on[lazy], undefined, `content boots without ${lazy} (lazy gRPC client)`);
    }
});

test('assessment runs api+worker with no gRPC server; it reaches content, document and auth lazily; egress for Turnstile', () => {
    const svc = services.assessment;
    assert.strictEqual(svc.build.args.SERVICE, 'assessment-service');
    assert.strictEqual(envValue('assessment', 'ROLE'), 'api,worker');
    assert.strictEqual(envValue('assessment', 'GRPC_PORT'), undefined, 'assessment serves no gRPC');
    assert.strictEqual(envValue('assessment', 'CONTENT_GRPC_URL'), 'content:50051');
    assert.strictEqual(envValue('assessment', 'DOCUMENT_GRPC_URL'), 'document:50051');
    assert.strictEqual(envValue('assessment', 'AUTH_GRPC_URL'), 'auth:50051');
    assert.ok(envValue('assessment', 'RABBITMQ_URL').startsWith('amqp://assessment:${RABBITMQ_ASSESSMENT_PASS:?'));
    assert.ok(envList('rabbitmq-defs').some((e) => e.startsWith('RABBITMQ_ASSESSMENT_PASS=')), 'the broker definitions need the assessment password');
    assert.ok(envValue('assessment', 'SERVICE_CLIENT_SECRET').includes('${ASSESSMENT_SERVICE_CLIENT_SECRET:?'));
    assert.deepStrictEqual(networksOf('assessment'), ['internal', 'egress']);
    assert.strictEqual(svc.depends_on.content, undefined, 'an exam in progress needs no content: assessment boots without it');
    assert.strictEqual(svc.depends_on.document, undefined);
    assert.strictEqual(svc.depends_on['content-migrate'], undefined, 'assessment never reads content tables');
});

test('study-room (studyroom role + schema) has its own migrate one-shot and no seed, no gRPC, no egress', () => {
    const svc = services['study-room'];
    const migrate = services['study-room-migrate'];
    assert.ok(svc && migrate, 'study-room / study-room-migrate are missing');
    assert.strictEqual(migrate.restart, 'no');
    assert.strictEqual(migrate.build.args.SERVICE, 'study-room-service');
    assert.strictEqual(svc.build.args.SERVICE, 'study-room-service');
    assert.strictEqual(
        svc.depends_on['study-room-migrate'].condition,
        'service_completed_successfully',
    );
    for (const name of ['study-room', 'study-room-migrate']) {
        const url = envValue(name, 'DATABASE_URL');
        assert.ok(url.startsWith('postgresql://studyroom_svc:'), `${name} must connect as studyroom_svc`);
        assert.ok(url.includes('${STUDYROOM_DB_PASSWORD:?'), `${name} must use its own password`);
        assert.ok(url.endsWith('?schema=studyroom'), `${name} must target schema studyroom`);
    }
    assert.deepStrictEqual(networksOf('study-room'), ['internal']);
    assert.ok(envValue('study-room', 'RABBITMQ_URL').startsWith('amqp://studyroom:'));
    assert.strictEqual(envValue('study-room', 'GRPC_PORT'), undefined, 'study-room serves no gRPC');
    assert.strictEqual(envValue('study-room', 'ROLE'), undefined, 'the consumer runs in the API process');
    assert.strictEqual(services.seed.depends_on['study-room-migrate'], undefined);
});

test('vocabulary (vocabulary role + schema) has its own migrate one-shot, a gRPC server and an r2 worker, no egress', () => {
    const svc = services.vocabulary;
    const migrate = services['vocabulary-migrate'];
    assert.ok(svc && migrate, 'vocabulary / vocabulary-migrate are missing');
    assert.strictEqual(migrate.restart, 'no');
    assert.strictEqual(migrate.build.args.SERVICE, 'vocabulary-service');
    assert.strictEqual(svc.build.args.SERVICE, 'vocabulary-service');
    assert.strictEqual(
        svc.depends_on['vocabulary-migrate'].condition,
        'service_completed_successfully',
    );
    for (const name of ['vocabulary', 'vocabulary-migrate']) {
        const url = envValue(name, 'DATABASE_URL');
        assert.ok(url.startsWith('postgresql://vocabulary_svc:'), `${name} must connect as vocabulary_svc`);
        assert.ok(url.includes('${VOCABULARY_DB_PASSWORD:?'), `${name} must use its own password`);
        assert.ok(url.endsWith('?schema=vocabulary'), `${name} must target schema vocabulary`);
    }
    assert.deepStrictEqual(networksOf('vocabulary'), ['internal']);
    assert.deepStrictEqual(networksOf('vocabulary-migrate'), ['internal']);
    assert.strictEqual(envValue('vocabulary', 'ROLE'), 'api,worker');
    assert.strictEqual(envValue('vocabulary', 'GRPC_PORT'), '50051');
    assert.strictEqual(envValue('vocabulary', 'R2_GRPC_URL'), 'r2:50051');
    assert.strictEqual(envValue('vocabulary', 'AI_GRPC_URL'), 'ai:50051');
    assert.strictEqual(envValue('vocabulary', 'AI_SERVICE_URL'), undefined, 'generation is gRPC now');
    assert.strictEqual(envValue('vocabulary', 'INTERNAL_SERVICE_TOKEN'), undefined, 'vocabulary uses a service token, not the shared internal token');
    assert.ok(envValue('vocabulary', 'R2_PUBLIC_URL') !== undefined, 'R2_PUBLIC_URL is needed to tell R2 images from external URLs');
    assert.ok(envValue('vocabulary', 'SERVICE_CLIENT_SECRET').includes('${VOCABULARY_SERVICE_CLIENT_SECRET:?'));
    assert.strictEqual(envValue('vocabulary', 'RABBITMQ_URL'), undefined, 'vocabulary has no broker user');
    // generation is free and TEACHER-only
    assert.strictEqual(envValue('vocabulary', 'FINANCE_GRPC_URL'), undefined);
    assert.ok(services.seed.depends_on['vocabulary-migrate'], 'the seed seeds the word-family categories');
    assert.ok(envList('seed').some((e) => e.startsWith('VOCABULARY_DATABASE_URL=postgresql://vocabulary_svc:')));
});

test('document (document role + schema) has its own migrate one-shot, a gRPC server, api+worker roles and the broker user `document`, no egress', () => {
    const svc = services.document;
    const migrate = services['document-migrate'];
    assert.ok(svc && migrate, 'document / document-migrate are missing');
    assert.strictEqual(migrate.restart, 'no');
    assert.strictEqual(migrate.build.args.SERVICE, 'document-service');
    assert.strictEqual(svc.build.args.SERVICE, 'document-service');
    assert.strictEqual(svc.depends_on['document-migrate'].condition, 'service_completed_successfully');
    for (const name of ['document', 'document-migrate']) {
        const url = envValue(name, 'DATABASE_URL');
        assert.ok(url.startsWith('postgresql://document_svc:'), `${name} must connect as document_svc`);
        assert.ok(url.includes('${DOCUMENT_DB_PASSWORD:?'), `${name} must use its own password`);
        assert.ok(url.endsWith('?schema=document'), `${name} must target schema document`);
    }
    assert.deepStrictEqual(networksOf('document'), ['internal']);
    assert.deepStrictEqual(networksOf('document-migrate'), ['internal']);
    assert.strictEqual(envValue('document', 'ROLE'), 'api,worker');
    assert.strictEqual(envValue('document', 'GRPC_PORT'), '50051');
    assert.strictEqual(envValue('document', 'R2_GRPC_URL'), 'r2:50051');
    assert.strictEqual(envValue('document', 'FINANCE_GRPC_URL'), undefined, 'uploads are free: no finance wiring');
    assert.ok(envValue('document', 'R2_PUBLIC_URL') !== undefined, 'R2_PUBLIC_URL is the base of the stored url');
    assert.ok(envValue('document', 'SERVICE_CLIENT_SECRET').includes('${DOCUMENT_SERVICE_CLIENT_SECRET:?'));
    assert.ok(envValue('document', 'RABBITMQ_URL').startsWith('amqp://document:${RABBITMQ_DOCUMENT_PASS:?'));
    assert.strictEqual(envValue('document', 'INTERNAL_SERVICE_TOKEN'), undefined, 'document never used the shared internal token');
    for (const dep of ['r2', 'rabbitmq', 'postgres', 'auth']) {
        assert.strictEqual(services.document.depends_on[dep].condition, 'service_healthy', dep);
    }
    assert.ok(envList('rabbitmq-defs').some((e) => e.startsWith('RABBITMQ_DOCUMENT_PASS=')), 'the broker definitions need the document password');
    assert.strictEqual(services.seed.depends_on['document-migrate'], undefined, 'document has nothing to seed');
});

test('uploads go to document: the gateway routes there and waits for it; content reaches document and ai over gRPC', () => {
    assert.strictEqual(envValue('gateway-a', 'DOCUMENT_SERVICE_URL'), 'http://document:3000');
    assert.strictEqual(services['gateway-a'].depends_on.document.condition, 'service_healthy');
    assert.strictEqual(envValue('content', 'DOCUMENT_GRPC_URL'), 'document:50051');
    assert.strictEqual(envValue('content', 'AI_GRPC_URL'), 'ai:50051');
    assert.strictEqual(services.content.depends_on.document, undefined, 'content boots without document (lazy gRPC client)');
});

test('the gateway routes quiz/flashcard paths to content and exam paths to assessment, and waits for both', () => {
    assert.strictEqual(envValue('gateway-a', 'CONTENT_SERVICE_URL'), 'http://content:3000');
    assert.strictEqual(envValue('gateway-a', 'ASSESSMENT_SERVICE_URL'), 'http://assessment:3000');
    assert.strictEqual(envValue('gateway-a', 'EXAM_SERVICE_URL'), undefined);
    assert.strictEqual(services['gateway-a'].depends_on.content.condition, 'service_healthy');
    assert.strictEqual(services['gateway-a'].depends_on.assessment.condition, 'service_healthy');
});

test('content serves gRPC and reaches vocabulary; admin and gateway point at vocabulary', () => {
    assert.strictEqual(envValue('content', 'VOCABULARY_GRPC_URL'), 'vocabulary:50051');
    assert.strictEqual(services.content.depends_on.vocabulary, undefined, 'content boots without vocabulary');
    assert.strictEqual(envValue('admin', 'VOCABULARY_GRPC_URL'), 'vocabulary:50051');
    assert.strictEqual(envValue('gateway-a', 'VOCABULARY_SERVICE_URL'), 'http://vocabulary:3000');
    assert.strictEqual(services['gateway-a'].depends_on.vocabulary.condition, 'service_healthy');
});

test('the gateway routes studyrooms and /ws/study to study-room, and waits for it', () => {
    assert.strictEqual(envValue('gateway-a', 'STUDYROOM_SERVICE_URL'), 'http://study-room:3000');
    assert.strictEqual(services['gateway-a'].depends_on['study-room'].condition, 'service_healthy');
});

test('seed runs after every migration of a service that has reference data, one URL per service (content and assessment have none)', () => {
    for (const svc of ['auth', 'admin', 'aichat']) {
        const migrate = svc === 'aichat' ? 'ai-chat-migrate' : `${svc}-migrate`;
        assert.strictEqual(services.seed.depends_on[migrate].condition, 'service_completed_successfully', migrate);
        assert.ok(envValue('seed', `${svc.toUpperCase()}_DATABASE_URL`).startsWith(`postgresql://${svc}_svc:`), svc);
    }
    assert.strictEqual(services.seed.depends_on['exam-migrate'], undefined, 'the subjects seed moved to ai-chat');
    for (const svc of ['content', 'assessment']) {
        assert.strictEqual(services.seed.depends_on[`${svc}-migrate`], undefined, `${svc} has nothing to seed`);
        assert.strictEqual(envValue('seed', `${svc.toUpperCase()}_DATABASE_URL`), undefined);
    }
    assert.strictEqual(envValue('seed', 'EXAM_DATABASE_URL'), undefined);
    assert.strictEqual(envValue('seed', 'DATABASE_URL'), undefined);
});

test('the dev seed is opt-in: only the seed profile runs it, never a plain up', () => {
    assert.deepStrictEqual(services.seed.profiles, ['seed']);
});

test('ai-chat (aichat role + schema) has its own migrate one-shot, api+worker roles, the broker user `aichat`, no gRPC server, no egress', () => {
    const svc = services['ai-chat'];
    const migrate = services['ai-chat-migrate'];
    assert.ok(svc && migrate, 'ai-chat / ai-chat-migrate are missing');
    assert.strictEqual(migrate.restart, 'no');
    assert.strictEqual(migrate.build.args.SERVICE, 'ai-chat-service');
    assert.strictEqual(svc.build.args.SERVICE, 'ai-chat-service');
    assert.strictEqual(svc.depends_on['ai-chat-migrate'].condition, 'service_completed_successfully');
    for (const name of ['ai-chat', 'ai-chat-migrate']) {
        const url = envValue(name, 'DATABASE_URL');
        assert.ok(url.startsWith('postgresql://aichat_svc:'), `${name} must connect as aichat_svc`);
        assert.ok(url.includes('${AICHAT_DB_PASSWORD:?'), `${name} must use its own password`);
        assert.ok(url.endsWith('?schema=aichat'), `${name} must target schema aichat`);
    }
    assert.deepStrictEqual(networksOf('ai-chat'), ['internal']);
    assert.deepStrictEqual(networksOf('ai-chat-migrate'), ['internal']);
    assert.strictEqual(envValue('ai-chat', 'ROLE'), 'api,worker');
    assert.strictEqual(envValue('ai-chat', 'GRPC_PORT'), undefined, 'ai-chat serves no gRPC');
    // gRPC out: ai-service (service token), document (forwarded user token), r2 (worker, service token)
    assert.strictEqual(envValue('ai-chat', 'AI_GRPC_URL'), 'ai:50051');
    assert.strictEqual(envValue('ai-chat', 'DOCUMENT_GRPC_URL'), 'document:50051');
    assert.strictEqual(envValue('ai-chat', 'FINANCE_GRPC_URL'), undefined, 'no subscription limits: no finance wiring');
    assert.strictEqual(envValue('ai-chat', 'R2_GRPC_URL'), 'r2:50051');
    assert.ok(envValue('ai-chat', 'R2_PUBLIC_URL') !== undefined, 'R2_PUBLIC_URL tells an R2 message image from an external URL');
    assert.ok(envValue('ai-chat', 'SERVICE_CLIENT_SECRET').includes('${AICHAT_SERVICE_CLIENT_SECRET:?'));
    assert.ok(envValue('ai-chat', 'RABBITMQ_URL').startsWith('amqp://aichat:${RABBITMQ_AICHAT_PASS:?'));
    assert.ok(envList('rabbitmq-defs').some((e) => e.startsWith('RABBITMQ_AICHAT_PASS=')), 'the broker definitions need the aichat password');
    for (const dep of ['postgres', 'redis', 'rabbitmq', 'auth']) {
        assert.strictEqual(svc.depends_on[dep].condition, 'service_healthy', dep);
    }
    assert.strictEqual(services.content.depends_on['ai-chat'], undefined);
});

test('AI chat and subjects are served by ai-chat: the gateway routes there and waits for it; content no longer knows ai-service over HTTP', () => {
    assert.strictEqual(envValue('gateway-a', 'AICHAT_SERVICE_URL'), 'http://ai-chat:3000');
    assert.strictEqual(services['gateway-a'].depends_on['ai-chat'].condition, 'service_healthy');
    assert.strictEqual(envValue('content', 'AI_SERVICE_URL'), undefined);
    assert.strictEqual(envValue('content', 'AI_CHAT_DOCUMENT_WAIT_MS'), undefined, 'the OCR wait moved to ai-chat');
});

test('no shared HTTP secret or HTTP route into ai-service is left anywhere in the stack (phase 13)', () => {
    for (const name of Object.keys(services)) {
        for (const key of ['INTERNAL_SERVICE_TOKEN', 'AI_SERVICE_URL', 'AI_HTTP_COMPAT']) {
            assert.strictEqual(envValue(name, key), undefined, `${name} still sets ${key}`);
        }
    }
    // the stack still inlines no secret through the shared .env file either: its example no longer lists the token
    const example = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');
    assert.ok(!/INTERNAL_SERVICE_TOKEN|AI_SERVICE_URL|AI_HTTP_COMPAT/.test(example));
});

// ---- phase 16: per-service env files ----------------------------------------------------------
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'services.json'), 'utf8'));
const envFiles = (name) =>
    (services[name].env_file ?? []).map((e) => (typeof e === 'string' ? { path: e } : e));
const templateKeys = (file) =>
    fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .map((l) => /^([A-Z][A-Z0-9_]*)=/.exec(l)?.[1])
        .filter(Boolean);

test('every service container reads only its own env/<name>.env, required; none reads the shared deploy/.env', () => {
    for (const group of Object.values(manifest)) {
        for (const [key, meta] of Object.entries(group)) {
            const want = `env/${meta.env ?? key}.env`;
            // a manifest key with `instances` (the gateway) is several compose services sharing one env file
            for (const name of meta.instances ?? [key]) {
                const files = envFiles(name);
                assert.deepStrictEqual(files.map((f) => f.path), [want], `${name} env_file`);
                assert.strictEqual(files[0].required, true, `${name}: env_file must be required (fail fast)`);
            }
            assert.ok(fs.existsSync(path.join(__dirname, `${want}.example`)), `${want}.example is missing`);
        }
    }
    assert.deepStrictEqual(envFiles('ai-worker').map((f) => f.path), ['env/ai.env']);
    for (const [name] of Object.entries(services)) {
        for (const file of envFiles(name)) {
            assert.notStrictEqual(file.path, '.env', `${name} still receives the shared .env`);
        }
    }
    // infra and the one-shot migrations take no env file (inline variables only)
    for (const name of Object.keys(services).filter((n) => n.endsWith('-migrate') || ['postgres', 'redis', 'rabbitmq', 'rabbitmq-defs'].includes(n))) {
        assert.strictEqual(services[name].env_file, undefined, `${name} must not have an env_file`);
    }
});

test('the dev seed reads auth.env (ADMIN_*) and nothing else', () => {
    assert.deepStrictEqual(envFiles('seed').map((f) => f.path), ['env/auth.env']);
    assert.strictEqual(envValue('seed', 'ADMIN_DEFAULT_PASSWORD'), undefined);
});

test('a variable lives either inline in compose or in the service env file, never both', () => {
    for (const group of Object.values(manifest)) {
        for (const [key, meta] of Object.entries(group)) {
            const keys = templateKeys(path.join(__dirname, `env/${meta.env ?? key}.env.example`));
            const names = [...(meta.instances ?? [key]), ...(meta.workerService ? [meta.workerService] : [])];
            for (const name of names) {
                const inline = new Set(envList(name).map((e) => e.split('=')[0]));
                for (const k of keys) assert.ok(!inline.has(k), `${name}: ${k} is set inline and listed in its env file`);
            }
        }
    }
});

test('secrets of one service are in its env file only (GOOGLE, EMAIL, R2 keys, GEMINI, QUIZ)', () => {
    const owner = { GOOGLE_: ['auth'], EMAIL_: ['auth'], R2_ACCESS_KEY_ID: ['r2'], R2_SECRET_ACCESS_KEY: ['r2'], GEMINI_API_KEYS: ['ai'], QUIZ_: ['assessment'] };
    for (const [prefix, owners] of Object.entries(owner)) {
        for (const group of Object.values(manifest)) {
            for (const [key, meta] of Object.entries(group)) {
                const has = templateKeys(path.join(__dirname, `env/${meta.env ?? key}.env.example`)).some((k) => k.startsWith(prefix));
                assert.strictEqual(has, owners.includes(key), `${prefix}* in env/${meta.env ?? key}.env.example`);
            }
        }
    }
});

test('deploy/.env.example declares every compose-required variable (ci-dummy.env.sh renders from it)', () => {
    const example = new Set(templateKeys(path.join(__dirname, '.env.example')));
    const required = new Set();
    for (const rel of includedPaths) {
        for (const m of fs.readFileSync(path.join(__dirname, rel), 'utf8').matchAll(/\$\{([A-Z][A-Z0-9_]*):\?/g)) required.add(m[1]);
    }
    for (const v of required) assert.ok(example.has(v), `${v} is required by compose but missing from deploy/.env.example`);
});

// ---------------------------------------------------------------------------
// Phase 16 part C: zero-downtime gateway, memory budget, worker liveness
// ---------------------------------------------------------------------------

test('gateway-a and gateway-b are one definition: same image, env and dependencies, distinct container names', () => {
    assert.strictEqual(services.gateway, undefined, 'the single `gateway` service is gone');
    const { container_name: nameA, ...a } = services['gateway-a'];
    const { container_name: nameB, ...b } = services['gateway-b'];
    assert.strictEqual(nameA, 'kmaedu-gateway-a');
    assert.strictEqual(nameB, 'kmaedu-gateway-b');
    assert.deepStrictEqual(a, b);
    assert.match(a.image, /kmaedu-gateway:\$\{GATEWAY_TAG:-main\}$/);
    assert.strictEqual(a.ports, undefined);
});

test('both gateway instances sit on edge + internal; `gateway` stays resolvable for the auth/admin control calls', () => {
    for (const name of ['gateway-a', 'gateway-b']) {
        assert.deepStrictEqual(networksOf(name).sort(), ['edge', 'internal']);
        assert.deepStrictEqual(services[name].networks.internal.aliases, ['gateway']);
        assert.strictEqual(services[name].stop_grace_period, '30s');
    }
    assert.match(envList('auth').join('\n'), /GATEWAY_GRPC_URL=gateway:50051/);
    assert.match(envList('admin').join('\n'), /GATEWAY_GRPC_URL=gateway:50051/);
});

test('nothing depends on the removed `gateway` service name', () => {
    for (const [name, service] of Object.entries(services)) {
        assert.ok(!('gateway' in (service.depends_on ?? {})), `${name} depends_on gateway`);
    }
});

test('every container has a mem_limit; the node services stay between 256m and 512m, the ai pair is sized for models', () => {
    const bytes = (v) => {
        const m = /^(\d+)([mg])$/.exec(String(v));
        assert.ok(m, `mem_limit "${v}" must look like 512m or 2g`);
        return Number(m[1]) * (m[2] === 'g' ? 1024 : 1);
    };
    for (const [name, service] of Object.entries(services)) {
        assert.ok(service.mem_limit, `${name} has no mem_limit`);
        bytes(service.mem_limit);
    }
    for (const name of ['admin', 'auth', 'content', 'gateway-a', 'gateway-b', 'r2', 'study-room']) {
        const mb = bytes(services[name].mem_limit);
        assert.ok(mb >= 256 && mb <= 512, `${name} ${services[name].mem_limit}`);
    }
    assert.strictEqual(services.ai.mem_limit, '1536m');
    assert.strictEqual(services['ai-worker'].mem_limit, '2g');
});

test('ai-worker has a real liveness check: the heartbeat file must be younger than 2 minutes', () => {
    const hc = services['ai-worker'].healthcheck;
    assert.notStrictEqual(hc.disable, true);
    assert.match(hc.test.join(' '), /find \/tmp\/worker-heartbeat -mmin -2/);
    assert.match(hc.test.join(' '), /grep -q/);
});

test('admin stays api-only: it has no worker code, so services.json marks it worker=false', () => {
    const registry = JSON.parse(fs.readFileSync(path.join(__dirname, 'services.json'), 'utf8'));
    assert.strictEqual(registry.node.admin.worker, false);
    assert.strictEqual(registry.node.vocabulary.worker, true);
    assert.ok(!envList('admin').some((e) => e.startsWith('ROLE=')));
    assert.ok(envList('vocabulary').includes('ROLE=api,worker'));
    assert.deepStrictEqual(registry.node.gateway.instances, ['gateway-a', 'gateway-b']);
});

test('the FE nginx proxies through the gw upstream with re-resolution and no BACKEND_URL', () => {
    const nginx = fs.readFileSync(path.join(__dirname, '..', '..', 'kmaedu-fe', 'nginx.conf'), 'utf8');
    assert.match(nginx, /resolver 127\.0\.0\.11 valid=5s/);
    assert.match(nginx, /upstream gw \{[^}]*zone gw 64k;[^}]*kmaedu-gateway-a:3000[^}]*resolve;[^}]*kmaedu-gateway-b:3000[^}]*resolve;/s);
    assert.match(nginx, /proxy_pass http:\/\/gw\/api\/;/);
    assert.match(nginx, /proxy_pass http:\/\/gw\/ws\/;/);
    assert.ok(!/BACKEND_URL/.test(nginx));
    assert.ok(!/^[^#\n]*non_idempotent/m.test(nginx), 'a POST must never be retried');
    const api = /location \/api\/ \{([\s\S]*?)\n    \}/.exec(nginx)[1];
    const ws = /location \/ws\/ \{([\s\S]*?)\n    \}/.exec(nginx)[1];
    assert.match(api, /proxy_next_upstream error timeout http_502 http_503;/);
    assert.ok(!/proxy_next_upstream/.test(ws), 'sockets are not retried');
});
