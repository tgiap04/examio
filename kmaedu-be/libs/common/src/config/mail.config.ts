import * as nodemailer from 'nodemailer';
import type { SendMailOptions, SentMessageInfo, Transporter } from 'nodemailer';

let transporter: Transporter | undefined;

/** Tests (and `MAIL_TRANSPORT=json`) never open a socket, whatever credentials the env holds. */
function usesJsonTransport(): boolean {
    return process.env.NODE_ENV === 'test' || process.env.MAIL_TRANSPORT === 'json';
}

/**
 * Built on the FIRST send, not at import: merely loading the module (or a stray
 * `.env`) can no longer reach a mail server.
 */
export function getMailTransporter(): Transporter {
    if (transporter) return transporter;
    if (usesJsonTransport()) {
        transporter = nodemailer.createTransport({ jsonTransport: true });
        return transporter;
    }
    const { EMAIL_USER: user, EMAIL_PASS: pass } = process.env;
    if (process.env.NODE_ENV === 'production' && (!user || !pass)) {
        throw new Error(
            'EMAIL_USER and EMAIL_PASS are required in production (or set MAIL_TRANSPORT=json to disable mail)'
        );
    }
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
    });
    return transporter;
}

/** Lazy facade with the same `sendMail` surface as the old eager transport. */
export const mailTransporter = {
    sendMail(options: SendMailOptions): Promise<SentMessageInfo> {
        return getMailTransporter().sendMail(options);
    },
};
