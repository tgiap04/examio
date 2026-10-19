'use strict';
// Run: node --test deploy/compose-topology.spec.cjs
// Static check of docker-compose.yml (no docker needed): network segmentation
// and published ports (RT-2).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('yaml');

const compose = parse(fs.readFileSync(path.join(__dirname, 'docker-compose.yml'), 'utf8'), {
    merge: true,
});
const services = compose.services;
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

test('the gateway has no database: no DATABASE_URL, no postgres/migration dependency', () => {
    const env = services.gateway.environment.map((e) => e.split('=')[0]);
    assert.ok(!env.includes('DATABASE_URL'));
    assert.ok(!('postgres' in services.gateway.depends_on));
    assert.ok(!('migration' in services.gateway.depends_on));
    assert.ok(env.includes('RABBITMQ_URL') && env.includes('GRPC_PORT'));
});

test('auth reaches the gateway control plane by default', () => {
    const env = services.auth.environment.join('\n');
    assert.match(env, /GATEWAY_CONTROL_ENABLED=\$\{GATEWAY_CONTROL_ENABLED:-true\}/);
    assert.match(env, /GATEWAY_GRPC_URL=gateway:50051/);
});
