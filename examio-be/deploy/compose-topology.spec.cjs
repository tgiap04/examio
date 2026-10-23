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
