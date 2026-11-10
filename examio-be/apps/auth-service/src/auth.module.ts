import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';

// Shared libs
import { PrismaModule, PrismaService } from './prisma';
import {
    MailService,
    PasswordService,
    GenerateIdService,
    TurnstileService,
    RefreshTokenCipherService,
} from '@examio/common';
import { RedisModule, RedisService } from '@examio/redis';
import { MessagingModule } from '@examio/messaging';

// Local imports
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleStrategy } from './strategies/google.strategy';
import { UserRepository } from './repositories/user.repository';
import { DevicesModule } from './devices/devices.module';
import { ProfileModule } from './profile/profile.module';
import { RolesModule } from './roles/roles.module';
import { UserStatusModule } from './user-status/user-status.module';
import { TokenModule } from './token/token.module';
import { AccessTokenService } from './token/access-token.service';
import { HttpThrottlerGuard } from './auth/guards/http-throttler.guard';

@Module({
    imports: [
        PrismaModule,
        RedisModule,
        MessagingModule.forRoot({ service: 'auth' }),
        TokenModule,
        RolesModule,
        UserStatusModule,
        PassportModule.register({ session: true }),
        DevicesModule,
        ProfileModule,
        // Rate limiting: 30 requests per minute globally
        ThrottlerModule.forRoot([
            {
                ttl: 60000,
                limit: 30,
            },
        ]),
    ],
    providers: [
        PrismaService,
        RedisService,
        PasswordService,
        GenerateIdService,
        GoogleStrategy,
        AuthService,
        AccessTokenService,
        MailService,
        UserRepository,
        TurnstileService,
        RefreshTokenCipherService,
        // Global rate limiting applied to all auth endpoints
        { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    ],
    controllers: [AuthController],
    exports: [AuthService, UserRepository, UserStatusModule],
})
export class AuthModule {}
