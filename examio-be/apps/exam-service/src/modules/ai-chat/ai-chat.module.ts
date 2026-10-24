import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AIChatController } from './ai-chat.controller';
import { AIChatService } from './ai-chat.service';
import { AIChatRepository } from './ai-chat.repository';

@Module({
    imports: [HttpModule],
    controllers: [AIChatController],
    providers: [AIChatService, AIChatRepository],
    exports: [AIChatService],
})
export class AIChatModule {}
