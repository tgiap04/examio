// Declares the "ai" topology exactly as libs/messaging does (the Nest services' code path).
// usage: node ts_declare_topology.cjs <kmaedu-be root> <amqp url>
const path = require('path');
const { createRequire } = require('module');

const [root, url] = process.argv.slice(2);
const req = createRequire(path.join(root, 'package.json'));
req('ts-node').register({
    transpileOnly: true,
    compilerOptions: { module: 'commonjs', target: 'es2020' },
});
const amqp = req('amqplib');
const { declareTopology } = req(path.join(root, 'libs/messaging/src/topology.ts'));

(async () => {
    const conn = await amqp.connect(url);
    const ch = await conn.createChannel();
    const names = await declareTopology(ch, 'ai');
    console.log(JSON.stringify(names));
    await ch.close();
    await conn.close();
})().catch((err) => {
    console.error(String(err && err.message ? err.message : err));
    process.exit(1);
});
