import { Module } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import { RedisService } from '@examio/redis';
import { GenerateIdService } from '@examio/common';
import { MessagingModule } from '@examio/messaging';
import { StudyRoomController } from './study-room.controller';
import { StudyRoomService } from './study-room.service';
import { StudyRoomRepository } from './study-room.repository';
import { StudyRoomStateService } from './study-room-state.service';
import { StudyRoomGateway } from './study-room.gateway';
import { StudyRoomSocketAuth } from './study-room-socket-auth.service';
import { StudyRoomBroadcaster } from './study-room-broadcaster.service';
import { StudyRoomPlaylistService } from './study-room-playlist.service';
import { StudyRoomAuthzHandler } from './study-room-authz.handler';

@Module({
    imports: [
        // Consumes exam.events (auth.user.authz_changed => disconnect that user's sockets).
        MessagingModule.forRoot({ service: 'exam', consume: { db: PrismaService } }),
    ],
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
        StudyRoomPlaylistService,
        StudyRoomAuthzHandler,
    ],
    controllers: [StudyRoomController],
    exports: [StudyRoomService, StudyRoomRepository],
})
export class StudyRoomModule {}
