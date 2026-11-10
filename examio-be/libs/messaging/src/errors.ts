/**
 * Thrown by an event handler (or the consumer's own validation) when retrying
 * can never succeed: the message goes straight to `<svc>.dlq`.
 */
export class PermanentEventError extends Error {
    constructor(
        public readonly code: string,
        message?: string
    ) {
        super(message ?? code);
        this.name = 'PermanentEventError';
    }
}
