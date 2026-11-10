import { Module } from '@nestjs/common';
import { GrpcClientModule } from '@examio/grpc';
import { AI_GRPC_REGISTRATION, AiClient } from '../../clients/ai.client';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { GenerationEventsHandler } from './generation-events.handler';
import { GenerationQueryService } from './generation-query.service';
import { GenerationModule } from './generation.module';
import { ModelCatalogService } from './model-catalog.service';

/**
 * Generation: uploads live in document-service (DocumentClient, global), the work runs in ai-service
 * (events), and the job lifecycle is GenerationModule.
 */
@Module({
    imports: [GenerationModule, GrpcClientModule.register(AI_GRPC_REGISTRATION)],
    controllers: [AIController],
    providers: [AIService, GenerationQueryService, ModelCatalogService, AiClient, GenerationEventsHandler],
})
export class AIModule {}
