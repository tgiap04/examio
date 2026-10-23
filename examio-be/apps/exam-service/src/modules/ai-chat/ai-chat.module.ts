import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AIChatController } from './ai-chat.controller';
import { AIChatService } from './ai-chat.service';
import { AIChatRepository } from './ai-chat.repository';
import { R2DeleteTaskWriter } from '@examio/messaging';

@Module({
    imports: [HttpModule],
    controllers: [AIChatController],
    providers: [AIChatService, AIChatRepository, R2DeleteTaskWriter],
    exports: [AIChatService],
})
export class AIChatModule {}
