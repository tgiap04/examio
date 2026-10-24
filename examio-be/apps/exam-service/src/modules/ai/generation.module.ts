import { Module } from '@nestjs/common';
import { GenerateIdService } from '@examio/common';
import { MessagingModule } from '@examio/messaging';
import { EXAM_MESSAGING } from '../../messaging/exam-messaging';
import { FinanceClientModule } from '../finance-client/finance-client.module';
import { GenerationChargeService } from './generation-charge.service';
import { GenerationJobRepository } from './generation-job.repository';
import { GenerationJobService } from './generation-job.service';
import { GenerationLockService } from './generation-lock.service';

/**
 * The generation charge flow, shared by the API role (routes, event handlers) and the worker role
 * (reaper). Outbox side of messaging only: the API never needs the broker to accept a job; the worker
 * relays the outbox.
 */
@Module({
    imports: [FinanceClientModule, MessagingModule.forRoot(EXAM_MESSAGING)],
    providers: [
        GenerateIdService,
        GenerationJobRepository,
        GenerationChargeService,
        GenerationLockService,
        GenerationJobService,
    ],
    exports: [GenerationJobRepository, GenerationChargeService, GenerationLockService, GenerationJobService, GenerateIdService],
})
export class GenerationModule {}
