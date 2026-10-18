import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '@examio/common';
import { AIChatController } from './ai-chat.controller';
import { AIChatService } from './ai-chat.service';
import { AIChatRepository } from './ai-chat.repository';
import { R2Module } from '../r2/r2.module';

@Module({
    imports: [
        HttpModule,
        AuthModule,
        R2Module,
    ],
    controllers: [AIChatController],
    providers: [AIChatService, AIChatRepository],
    exports: [AIChatService],
})
export class AIChatModule {}
