import { Module } from '@nestjs/common';
import { GenerateIdService } from '@kmaedu/common';
import { MessagingModule } from '@kmaedu/messaging';
import { SessionRevokedPublisher } from '../devices/session-revoked.publisher';
import { RoleChangeRepository } from '../roles/role-change.repository';
import { RolesModule } from '../roles/roles.module';
import { UserStatusRepository } from './user-status.repository';
import { UserStatusService } from './user-status.service';

@Module({
    imports: [RolesModule, MessagingModule.forRoot({ service: 'auth' })],
    providers: [
        UserStatusService,
        UserStatusRepository,
        RoleChangeRepository,
        SessionRevokedPublisher,
        GenerateIdService,
    ],
    exports: [UserStatusService],
})
export class UserStatusModule {}
