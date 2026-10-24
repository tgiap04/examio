export const MESSAGING_OPTIONS = Symbol('MESSAGING_OPTIONS');
export const MESSAGING_DB = Symbol('MESSAGING_DB');
export const RELAY_POOL = Symbol('RELAY_POOL');

export interface MessagingModuleOptions {
    /** Service name: broker user, queue prefix and envelope `source` (the domain). */
    service: string;
    /**
     * Other domains whose events this service writes to its own outbox and relays on their behalf
     * (e.g. exam publishes `content.*` until the content-service exists). `OutboxService.add` takes
     * the envelope `source` from the event type's domain and only accepts the service itself or a
     * domain listed here; the relay claims rows of all of them. The broker user must be allowed
     * to publish those routing keys.
     */
    alsoPublishes?: readonly string[];
    /** Run the outbox relay + daily purge (worker role). */
    relay?: boolean;
    /** Consume `<service>.events`; `db` is the injection token of the app's Prisma client. */
    consume?: { db: unknown };
}

/** The slice of the options the services read at runtime. */
export type MessagingServiceOptions = Pick<MessagingModuleOptions, 'service' | 'alsoPublishes'>;

/** Every envelope source this service may write and relay: itself plus `alsoPublishes`. */
export function publishedSources(options: MessagingServiceOptions): string[] {
    return [options.service, ...(options.alsoPublishes ?? [])];
}
