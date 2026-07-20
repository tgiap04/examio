import { Module } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import { RedisService } from '@examio/redis';
import { GenerateIdService, AuthModule } from '@examio/common';
import { StudyRoomController } from './study-room.controller';
import { StudyRoomService } from './study-room.service';
import { StudyRoomRepository } from './study-room.repository';
import { StudyRoomStateService } from './study-room-state.service';
import { StudyRoomGateway } from './study-room.gateway';
import { StudyRoomSocketAuth } from './study-room-socket-auth.service';
import { StudyRoomBroadcaster } from './study-room-broadcaster.service';

@Module({
    imports: [AuthModule],
    providers: [
        PrismaService,
        RedisService,
        GenerateIdService,
        StudyRoomService,
        StudyRoomRepository,
        StudyRoomStateService,
        StudyRoomGateway,
        StudyRoomSocketAuth,
        StudyRoomBroadcaster,
    ],
    controllers: [StudyRoomController],
    exports: [StudyRoomService, StudyRoomRepository],
})
export class StudyRoomModule {}
