import { MessagingModule } from '@examio/messaging';

/**
 * Producer side of the outbox (finance events). One shared dynamic-module
 * instance: the relay and the consumer run in the worker role (worker.module.ts).
 */
export const FINANCE_MESSAGING = MessagingModule.forRoot({ service: 'finance' });
