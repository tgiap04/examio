import { Module } from '@nestjs/common';
import { GenerateIdService } from '@examio/common';
import { StudyRoomController } from './study-room.controller';
import { StudyRoomService } from './study-room.service';
import { StudyRoomRepository } from './study-room.repository';
import { StudyRoomStateService } from './study-room-state.service';
import { StudyRoomGateway } from './study-room.gateway';
import { StudyRoomSocketAuth } from './study-room-socket-auth.service';
import { StudyRoomBroadcaster } from './study-room-broadcaster.service';
import { StudyRoomPlaylistService } from './study-room-playlist.service';
import { StudyRoomAuthzHandler } from './study-room-authz.handler';
import { StudyRoomShutdown } from './study-room-shutdown.service';

@Module({
    // PrismaService / RedisService come from the global PrismaModule / RedisModule;
    // `auth.user.authz_changed` (StudyRoomAuthzHandler) is consumed by the root
    // module's MessagingModule, in this API process (it owns the Socket.io server).
    providers: [
        GenerateIdService,
        StudyRoomService,
        StudyRoomRepository,
        StudyRoomStateService,
        StudyRoomGateway,
        StudyRoomSocketAuth,
        StudyRoomBroadcaster,
        StudyRoomPlaylistService,
        StudyRoomAuthzHandler,
        StudyRoomShutdown,
    ],
    controllers: [StudyRoomController],
    exports: [StudyRoomService, StudyRoomRepository],
})
export class StudyRoomModule {}
