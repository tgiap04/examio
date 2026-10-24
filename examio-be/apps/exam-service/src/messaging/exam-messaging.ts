import type { MessagingModuleOptions } from '@examio/messaging';

/**
 * exam's identity on the bus. Until phase 14 creates content-service, exam owns the content domain, so
 * its outbox also carries `content.*` events (`content.generation.requested`, published with
 * `source=content`; the broker user `exam` may publish `^(exam|content)\.`).
 */
export const EXAM_MESSAGING: Pick<MessagingModuleOptions, 'service' | 'alsoPublishes'> = {
    service: 'exam',
    alsoPublishes: ['content'],
};
