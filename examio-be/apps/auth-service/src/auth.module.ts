import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

// Shared libs
import { DatabaseModule, PrismaService } from '@examio/database';
import {
    MailService,
    PasswordService,
    GenerateIdService,
    AuthGuard,
    GrpcClientsModule,
    EventsModule,
    EventPublisherService,
    TurnstileService,
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
        GrpcClientsModule.registerWalletClient(),
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
    ],
    controllers: [AuthController],
    exports: [AuthService, JwtModule, AuthGuard, UserRepository],
})
export class AuthModule {}
