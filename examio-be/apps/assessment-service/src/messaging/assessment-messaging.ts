import type { MessagingModuleOptions } from '@examio/messaging';

/**
 * assessment's identity on the bus: broker user and outbox `source` are both `assessment`; the
 * consumer reads `assessment.events` (`content.quizset.deleted`, `auth.user.updated`). Nothing is
 * published yet (no `assessment.*` event has a consumer), but the worker role keeps the relay so the
 * first one needs no new wiring.
 */
export const ASSESSMENT_MESSAGING: Pick<MessagingModuleOptions, 'service'> = {
    service: 'assessment',
};
