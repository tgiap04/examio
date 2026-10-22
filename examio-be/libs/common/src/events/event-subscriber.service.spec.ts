import { ConfigService } from '@nestjs/config';
import { EventSubscriberService } from './event-subscriber.service';
import { RabbitMQService } from './rabbitmq.service';

const build = (env: Record<string, string | undefined>) =>
    new EventSubscriberService(
        {} as RabbitMQService,
        { get: (key: string, fallback?: string) => env[key] ?? fallback } as unknown as ConfigService
    );

describe('EventSubscriberService queue name', () => {
    it('uses SERVICE_NAME as the per-service queue', () => {
        expect((build({ SERVICE_NAME: 'exam-service' }) as unknown as { queueName: string }).queueName).toBe('exam-service');
    });

    it('fails fast with a clear error instead of silently using a queue no broker user may touch', () => {
        expect(() => build({})).toThrow(/SERVICE_NAME is required/);
    });
});
