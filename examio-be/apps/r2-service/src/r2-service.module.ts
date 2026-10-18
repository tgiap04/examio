import { Module } from '@nestjs/common';
import { R2ServiceController } from './r2-service.controller';
import { R2ServiceService } from './r2-service.service';
import { HealthModule, LoggerModule } from '@examio/observability';
import { AuthJwtModule } from '@examio/auth-jwt';

@Module({
  imports: [
    LoggerModule.forRoot('r2-service'),
    HealthModule.forRoot({ checks: [] }),
    AuthJwtModule.forRoot({ serviceName: 'r2' }),
  ],
  controllers: [R2ServiceController],
  providers: [R2ServiceService],
})
export class R2ServiceModule {}
