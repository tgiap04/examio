export const MESSAGING_OPTIONS = Symbol('MESSAGING_OPTIONS');
export const MESSAGING_DB = Symbol('MESSAGING_DB');
export const RELAY_POOL = Symbol('RELAY_POOL');

export interface MessagingModuleOptions {
    /** Service name: broker user, queue prefix and envelope `source` (the domain). */
    service: string;
    /** Run the outbox relay + daily purge (worker role). */
    relay?: boolean;
    /** Consume `<service>.events`; `db` is the injection token of the app's Prisma client. */
    consume?: { db: unknown };
}

/** The slice of the options the services read at runtime. */
export type MessagingServiceOptions = Pick<MessagingModuleOptions, 'service'>;
