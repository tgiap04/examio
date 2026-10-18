#!/usr/bin/env node
'use strict';
/**
 * Renders deploy/rabbitmq/definitions.template.json into definitions.json.
 *
 *   {{ENV:VAR}}   -> value of env VAR (plain)
 *   {{HASH:VAR}}  -> rabbit_password_hashing_sha256 hash of env VAR
 *
 * Fails fast (exit 1, nothing written) when any referenced variable is
 * missing or empty: the broker skips its default user when definitions are
 * imported, so a half-rendered file would lock operators out.
 * The output holds password hashes only and is gitignored.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PLACEHOLDER = /\{\{(ENV|HASH):([A-Z0-9_]+)\}\}/g;

/** base64(salt(4) || sha256(salt || utf8 password)) */
function hashPassword(password, salt = crypto.randomBytes(4)) {
    const digest = crypto
        .createHash('sha256')
        .update(Buffer.concat([salt, Buffer.from(password, 'utf8')]))
        .digest();
    return Buffer.concat([salt, digest]).toString('base64');
}

function requiredVars(templateText) {
    return [...new Set([...templateText.matchAll(PLACEHOLDER)].map((m) => m[2]))];
}

function renderDefinitions(templateText, env) {
    const missing = requiredVars(templateText).filter((v) => !env[v]);
    if (missing.length > 0) {
        throw new Error(`missing required env: ${missing.join(', ')}`);
    }
    const rendered = templateText.replace(PLACEHOLDER, (_, kind, name) =>
        kind === 'HASH' ? hashPassword(env[name]) : env[name]
    );
    return JSON.parse(rendered);
}

function main(argv) {
    const outIdx = argv.indexOf('--out');
    const out =
        outIdx >= 0 && argv[outIdx + 1]
            ? argv[outIdx + 1]
            : path.join(__dirname, 'definitions.json');
    const template = fs.readFileSync(
        path.join(__dirname, 'definitions.template.json'),
        'utf8'
    );
    try {
        const defs = renderDefinitions(template, process.env);
        fs.writeFileSync(out, `${JSON.stringify(defs, null, 2)}\n`, {
            mode: 0o644,
        });
        fs.chmodSync(out, 0o644);
        process.stdout.write(`rendered ${path.basename(out)} (${defs.users.length} users)\n`);
    } catch (err) {
        process.stderr.write(`render-definitions: ${err.message}\n`);
        process.exit(1);
    }
}

if (require.main === module) {
    main(process.argv.slice(2));
}

module.exports = { hashPassword, renderDefinitions, requiredVars };
