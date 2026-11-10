import { Module } from '@nestjs/common';
import { GenerateIdService } from '@examio/common';
import { MessagingModule } from '@examio/messaging';
import { CONTENT_MESSAGING } from '../../messaging/content-messaging';
import { GenerationJobRepository } from './generation-job.repository';
import { GenerationJobService } from './generation-job.service';
import { GenerationLockService } from './generation-lock.service';

/**
 * The generation job lifecycle, shared by the API role (routes, event handlers) and the worker role
 * (watchdog). Outbox side of messaging only: the API never needs the broker to accept a job; the worker
 * relays the outbox.
 */
@Module({
    imports: [MessagingModule.forRoot(CONTENT_MESSAGING)],
    providers: [
        GenerateIdService,
        GenerationJobRepository,
        GenerationLockService,
        GenerationJobService,
    ],
    exports: [GenerationJobRepository, GenerationLockService, GenerationJobService, GenerateIdService],
})
export class GenerationModule {}
