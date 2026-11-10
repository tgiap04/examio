import { Module } from '@nestjs/common';
import { ExamAttemptService } from './examattempt.service';
import { ExamAttemptController } from './examattempt.controller';
import { PrismaService } from '../../prisma';
import { GenerateIdService, CryptoService, TurnstileService } from '@kmaedu/common';
import { RedisModule, RedisService } from '@kmaedu/redis';
import { ExamAttemptRepository } from './examattempt.repository';
import { ExamSessionRepository } from '../examsession/examsession.repository';

@Module({
    imports: [RedisModule],
    providers: [
        PrismaService,
        RedisService,
        ExamAttemptService,
        GenerateIdService,
        CryptoService,
        TurnstileService,
        ExamAttemptRepository,
        ExamSessionRepository,
    ],
    controllers: [ExamAttemptController],
    exports: [ExamAttemptService, ExamAttemptRepository],
})
export class ExamAttemptModule {}
