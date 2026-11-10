import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { MessagingModule, R2DeleteTaskWriter } from '@examio/messaging';
import { RedisService } from '@examio/redis';
import { UserRepository } from '../repositories/user.repository';
import { UserUpdateWriter } from './user-update.writer';
import { UserUpdatedPublisher } from './user-updated.publisher';

@Module({
    imports: [MessagingModule.forRoot({ service: 'auth' })],
    providers: [
        PrismaService,
        RedisService,
        UserRepository,
        UserUpdatedPublisher,
        UserUpdateWriter,
        R2DeleteTaskWriter,
    ],
    exports: [UserUpdateWriter],
})
export class UserUpdateModule {}
