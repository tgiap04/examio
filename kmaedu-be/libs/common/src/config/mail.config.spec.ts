import * as net from 'net';
import * as tls from 'tls';

const ENV_KEYS = ['NODE_ENV', 'MAIL_TRANSPORT', 'EMAIL_USER', 'EMAIL_PASS'] as const;

describe('mail transport (lazy, never networked under test)', () => {
    const saved: Record<string, string | undefined> = {};
    beforeEach(() => {
        for (const k of ENV_KEYS) saved[k] = process.env[k];
        jest.resetModules();
    });
    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
        jest.restoreAllMocks();
    });

    function load() {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const nodemailer = require('nodemailer') as typeof import('nodemailer');
        const create = jest.spyOn(nodemailer, 'createTransport');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const cfg = require('./mail.config') as typeof import('./mail.config');
        return { create, cfg };
    }

    it('importing the module builds no transport', () => {
        process.env.NODE_ENV = 'test';
        const { create } = load();
        expect(create).not.toHaveBeenCalled();
    });

    it.each([
        ['NODE_ENV=test', { NODE_ENV: 'test' }],
        ['MAIL_TRANSPORT=json even in production with real creds', { NODE_ENV: 'production', MAIL_TRANSPORT: 'json', EMAIL_USER: 'u@x.io', EMAIL_PASS: 'p' }],
        ['NODE_ENV=test even with creds present', { NODE_ENV: 'test', EMAIL_USER: 'u@x.io', EMAIL_PASS: 'p' }],
    ])('%s: JSON transport, no socket opened', async (_n, env) => {
        for (const k of ENV_KEYS) delete process.env[k];
        Object.assign(process.env, env);
        const connect = [jest.spyOn(net, 'connect'), jest.spyOn(tls, 'connect'), jest.spyOn(net.Socket.prototype, 'connect')];
        const { create, cfg } = load();
        const info = await cfg.mailTransporter.sendMail({ from: 'a@x.io', to: 'b@x.io', subject: 's', html: '<p>x</p>' });
        expect(create).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith({ jsonTransport: true });
        expect(JSON.parse((info as { message: string }).message).subject).toBe('s');
        connect.forEach((s) => expect(s).not.toHaveBeenCalled());
    });

    it('the transport is built once, on first send', async () => {
        process.env.NODE_ENV = 'test';
        const { create, cfg } = load();
        await cfg.mailTransporter.sendMail({ to: 'a@x.io', subject: '1' });
        await cfg.mailTransporter.sendMail({ to: 'a@x.io', subject: '2' });
        expect(create).toHaveBeenCalledTimes(1);
    });

    it('production without EMAIL_USER/EMAIL_PASS fails fast with a clear error', () => {
        for (const k of ENV_KEYS) delete process.env[k];
        process.env.NODE_ENV = 'production';
        const { cfg } = load();
        expect(() => cfg.getMailTransporter()).toThrow(/EMAIL_USER and EMAIL_PASS are required in production/);
        process.env.EMAIL_USER = 'u@x.io';
        expect(() => cfg.getMailTransporter()).toThrow(/EMAIL_USER and EMAIL_PASS are required/);
    });

    it('production with credentials uses the gmail service transport', () => {
        for (const k of ENV_KEYS) delete process.env[k];
        Object.assign(process.env, { NODE_ENV: 'production', EMAIL_USER: 'u@x.io', EMAIL_PASS: 'p' });
        const { create, cfg } = load();
        cfg.getMailTransporter();
        expect(create).toHaveBeenCalledWith({ service: 'gmail', auth: { user: 'u@x.io', pass: 'p' } });
    });
});
