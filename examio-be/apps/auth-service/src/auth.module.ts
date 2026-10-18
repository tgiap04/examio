import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

// Shared libs
import { DatabaseModule, PrismaService } from '@examio/database';
import {
    MailService,
    PasswordService,
    GenerateIdService,
    AuthGuard,
    EventsModule,
    EventPublisherService,
    TurnstileService,
    RefreshTokenCipherService,
} from '@examio/common';
import { RedisModule, RedisService } from '@examio/redis';

// Local imports
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleStrategy } from './strategies/google.strategy';
import { UserRepository } from './repositories/user.repository';
import { DevicesModule } from './devices/devices.module';
import { ProfileModule } from './profile/profile.module';

@Module({
    imports: [
        DatabaseModule,
        RedisModule,
        EventsModule,
        JwtModule.register({
            secret: process.env.JWT_SECRET,
            signOptions: {
                expiresIn: (process.env.ACCESS_TOKEN_EXPIRATION ||
                    '15m') as any,
            },
        }),
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
        MailService,
        AuthGuard,
        UserRepository,
        TurnstileService,
        RefreshTokenCipherService,
        // Global rate limiting applied to all auth endpoints
        { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
    controllers: [AuthController],
    exports: [AuthService, JwtModule, AuthGuard, UserRepository],
})
export class AuthModule {}
