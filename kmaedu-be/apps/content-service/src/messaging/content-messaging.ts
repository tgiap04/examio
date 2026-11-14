import type { MessagingModuleOptions } from '@kmaedu/messaging';

/**
 * content's identity on the bus: broker user and outbox `source` are both `content`
 * (`content.generation.requested`, `content.quizset.deleted`); the consumer reads `content.events`.
 */
export const CONTENT_MESSAGING: Pick<MessagingModuleOptions, 'service'> = {
    service: 'content',
};
