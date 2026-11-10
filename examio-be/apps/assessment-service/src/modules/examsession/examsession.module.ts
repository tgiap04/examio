import { Module } from '@nestjs/common';
import { ExamSessionService } from './examsession.service';
import { ExamSessionController } from './examsession.controller';
import { PrismaService } from '../../prisma';
import { GenerateIdService } from '@examio/common';
import { RedisService } from '@examio/redis';
import { ExamSessionRepository } from './examsession.repository';
import { ExamRoomRepository } from '../examroom/examroom.repository';
import { UserSearchService } from '../common/user-search.service';

@Module({
    imports: [],
    providers: [
        PrismaService,
        RedisService,
        ExamSessionService,
        GenerateIdService,
        ExamSessionRepository,
        ExamRoomRepository,
        UserSearchService,
    ],
    controllers: [ExamSessionController],
    exports: [ExamSessionService, ExamSessionRepository],
})
export class ExamSessionModule {}
