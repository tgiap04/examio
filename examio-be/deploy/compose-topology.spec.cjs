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
const DB_SERVICES = ['auth', 'finance', 'admin', 'exam'];
const ROLES = 'auth finance admin exam content assessment studyroom vocabulary aichat document ai'.split(' ');
const envList = (name) => services[name].environment ?? [];
const envValue = (name, key) => {
    const hit = envList(name).find((e) => e.startsWith(`${key}=`));
    return hit === undefined ? undefined : hit.slice(key.length + 1);
};
const networksOf = (name) => services[name].networks ?? [];
const members = (network) =>
    Object.keys(services)
        .filter((n) => networksOf(n).includes(network))
        .sort();

test('postgres, redis and rabbitmq publish no host port', () => {
    for (const name of ['postgres', 'redis', 'rabbitmq']) {
        assert.strictEqual(services[name].ports, undefined, `${name} must not publish ports`);
    }
});

test('only the gateway publishes a host port (until the phase-16 cutover)', () => {
    const published = Object.keys(services).filter((n) => services[n].ports);
    assert.deepStrictEqual(published, ['gateway']);
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

test('edge carries the gateway alone (the FE nginx joins it from its own compose)', () => {
    assert.deepStrictEqual(members('edge'), ['gateway']);
});

test('egress is exactly the services with a real internet dependency', () => {
    assert.deepStrictEqual(members('egress'), ['ai', 'auth', 'exam', 'finance', 'r2']);
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
    assert.strictEqual(compose.networks.edge.name, 'examio-edge');
    assert.strictEqual(compose.networks.internal.name, 'examio-internal');
    assert.strictEqual(compose.networks.egress.name, 'examio-egress');
    assert.strictEqual(compose.networks['examio-network'], undefined);
});

test('the gateway has no database: no DATABASE_URL, no postgres/migrate dependency', () => {
    const env = services.gateway.environment.map((e) => e.split('=')[0]);
    assert.ok(!env.includes('DATABASE_URL'));
    assert.ok(!('postgres' in services.gateway.depends_on));
    assert.ok(!Object.keys(services.gateway.depends_on).some((d) => d.endsWith('-migrate')));
    assert.ok(env.includes('RABBITMQ_URL') && env.includes('GRPC_PORT'));
});

test('auth reaches the gateway control plane by default', () => {
    const env = services.auth.environment.join('\n');
    assert.match(env, /GATEWAY_CONTROL_ENABLED=\$\{GATEWAY_CONTROL_ENABLED:-true\}/);
    assert.match(env, /GATEWAY_GRPC_URL=gateway:50051/);
});

test('every compose file is included and defines at least one service', () => {
    assert.ok(includedPaths.length >= 8, 'docker-compose.yml must include the per-service files');
    for (const rel of includedPaths) {
        assert.ok(fs.existsSync(path.join(__dirname, rel)), `${rel} is included but missing`);
    }
    for (const part of parts) assert.ok(Object.keys(part.services ?? {}).length > 0);
});

test('the single examio-migration container is gone', () => {
    assert.strictEqual(services.migration, undefined);
    assert.ok(!fs.existsSync(path.join(__dirname, 'entrypoint-migration.sh')));
});

test('each database service has a <svc>-migrate one-shot its API waits for', () => {
    for (const svc of DB_SERVICES) {
        const migrate = services[`${svc}-migrate`];
        assert.ok(migrate, `${svc}-migrate is missing`);
        assert.strictEqual(migrate.restart, 'no');
        assert.strictEqual(migrate.build.args.SERVICE, svc);
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

test('ai-service uses ai_svc with a pinned search_path and no runtime DDL', () => {
    const url = envValue('ai', 'DATABASE_URL');
    assert.ok(url.startsWith('postgresql://ai_svc:'));
    assert.ok(!url.includes('?schema='), 'asyncpg would forward ?schema= as a server setting');
    assert.strictEqual(envValue('ai', 'DB_SEARCH_PATH'), 'exam,extensions');
    assert.strictEqual(envValue('ai', 'AI_RUNTIME_DDL'), 'false');
    assert.strictEqual(services.ai.depends_on['exam-migrate'].condition, 'service_completed_successfully');
});

test('r2 has no database and no migrate dependency', () => {
    assert.ok(!envList('r2').some((e) => e.startsWith('DATABASE_URL=')));
    assert.ok(!Object.keys(services.r2.depends_on ?? {}).some((d) => d.endsWith('-migrate')));
});

test('postgres mounts the init dir, raises max_connections and takes all 11 role passwords', () => {
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

test('study-room (studyroom role + schema) has its own migrate one-shot and no seed, no gRPC, no egress', () => {
    const svc = services['study-room'];
    const migrate = services['study-room-migrate'];
    assert.ok(svc && migrate, 'study-room / study-room-migrate are missing');
    assert.strictEqual(migrate.restart, 'no');
    assert.strictEqual(migrate.build.args.SERVICE, 'study-room');
    assert.strictEqual(svc.build.args.SERVICE_NAME, 'study-room-service');
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
    assert.strictEqual(migrate.build.args.SERVICE, 'vocabulary');
    assert.strictEqual(svc.build.args.SERVICE_NAME, 'vocabulary-service');
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
    assert.strictEqual(envValue('vocabulary', 'AI_SERVICE_URL'), 'http://ai:3000/api');
    assert.ok(envValue('vocabulary', 'R2_PUBLIC_URL') !== undefined, 'R2_PUBLIC_URL is needed to tell R2 images from external URLs');
    assert.ok(envValue('vocabulary', 'SERVICE_CLIENT_SECRET').includes('${VOCABULARY_SERVICE_CLIENT_SECRET:?'));
    assert.strictEqual(envValue('vocabulary', 'RABBITMQ_URL'), undefined, 'vocabulary has no broker user');
    // no finance wiring: generation is free and TEACHER-only
    assert.strictEqual(envValue('vocabulary', 'FINANCE_GRPC_URL'), undefined);
    assert.ok(services.seed.depends_on['vocabulary-migrate'], 'the seed seeds the word-family categories');
    assert.ok(envList('seed').some((e) => e.startsWith('VOCABULARY_DATABASE_URL=postgresql://vocabulary_svc:')));
});

test('exam no longer serves gRPC and reaches vocabulary; admin and gateway point at vocabulary', () => {
    assert.strictEqual(envValue('exam', 'GRPC_PORT'), undefined, 'exam serves no gRPC any more');
    assert.strictEqual(envValue('exam', 'VOCABULARY_GRPC_URL'), 'vocabulary:50051');
    assert.strictEqual(services.exam.depends_on.vocabulary, undefined, 'exam boots without vocabulary');
    assert.strictEqual(envValue('admin', 'VOCABULARY_GRPC_URL'), 'vocabulary:50051');
    assert.strictEqual(envValue('gateway', 'VOCABULARY_SERVICE_URL'), 'http://vocabulary:3000');
    assert.strictEqual(services.gateway.depends_on.vocabulary.condition, 'service_healthy');
});

test('the gateway routes studyrooms and /ws/study to study-room, and waits for it', () => {
    assert.strictEqual(envValue('gateway', 'STUDYROOM_SERVICE_URL'), 'http://study-room:3000');
    assert.strictEqual(services.gateway.depends_on['study-room'].condition, 'service_healthy');
});

test('seed runs after every migration, one URL per service', () => {
    for (const svc of DB_SERVICES) {
        assert.strictEqual(
            services.seed.depends_on[`${svc}-migrate`].condition,
            'service_completed_successfully',
        );
        assert.ok(envValue('seed', `${svc.toUpperCase()}_DATABASE_URL`).startsWith(`postgresql://${svc}_svc:`));
    }
    assert.strictEqual(envValue('seed', 'DATABASE_URL'), undefined);
});

test('the dev seed is opt-in: only the seed profile runs it, never a plain up', () => {
    assert.deepStrictEqual(services.seed.profiles, ['seed']);
});
