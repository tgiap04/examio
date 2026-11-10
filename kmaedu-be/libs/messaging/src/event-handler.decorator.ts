import { SetMetadata } from '@nestjs/common';

export const EVENT_HANDLER_METADATA = 'kmaedu:event-handler';

export interface EventHandlerOptions {
    /**
     * Default true: the handler runs in one DB tx with a `processed_events`
     * insert and receives `(envelope, tx)`. Use `false` only for handlers that
     * are idempotent by construction and have no DB; they receive `(envelope)`.
     */
    dedupe?: boolean;
}

export interface EventHandlerMetadata {
    type: string;
    options: EventHandlerOptions;
}

/** Marks a provider method as the handler of one event type (routing key). */
export const EventHandler = (
    type: string,
    options: EventHandlerOptions = {}
): MethodDecorator =>
    SetMetadata<string, EventHandlerMetadata>(EVENT_HANDLER_METADATA, {
        type,
        options,
    });
