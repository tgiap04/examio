import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { RedisService } from '@examio/redis';
import { QuizsetModule } from '../quizset/quizset.module';
import { QuizPracticeAttemptService } from './quiz-practice-attempt.service';
import { QuizPracticeController } from './quiz-practice.controller';
import { QuizPracticeRepository } from './quiz-practice.repository';
import { QuizPracticeService } from './quiz-practice.service';

@Module({
    imports: [QuizsetModule], // QuizSetOwnerResolver for @RequireOwnerOrPermission
    providers: [
        PrismaService,
        RedisService,
        QuizPracticeRepository,
        QuizPracticeService,
        QuizPracticeAttemptService,
    ],
    controllers: [QuizPracticeController],
})
export class QuizPracticeModule {}
