import { Module } from '@nestjs/common';
import { R2ServiceController } from './r2-service.controller';
import { R2ServiceService } from './r2-service.service';
import { HealthModule, LoggerModule } from '@examio/observability';

@Module({
  imports: [
    LoggerModule.forRoot('r2-service'),
    HealthModule.forRoot({ checks: [] }),
  ],
  controllers: [R2ServiceController],
  providers: [R2ServiceService],
})
export class R2ServiceModule {}
