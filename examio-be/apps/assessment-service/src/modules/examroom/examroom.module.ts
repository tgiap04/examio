import { Module } from '@nestjs/common';
import { ExamRoomService } from './examroom.service';
import { ExamRoomController } from './examroom.controller';
import { PrismaService } from '../../prisma';
import { GenerateIdService } from '@examio/common';
import { RedisService } from '@examio/redis';
import { ExamRoomRepository } from './examroom.repository';
import { QuizSetTitles } from './quiz-set-titles.cache';

@Module({
    imports: [],
    providers: [
        PrismaService,
        RedisService,
        ExamRoomService,
        GenerateIdService,
        ExamRoomRepository,
        QuizSetTitles,
    ],
    controllers: [ExamRoomController],
    exports: [ExamRoomService, ExamRoomRepository, QuizSetTitles],
})
export class ExamRoomModule {}
