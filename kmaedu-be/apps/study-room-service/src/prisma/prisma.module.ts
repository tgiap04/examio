import { Global, Module } from '@nestjs/common';
import { PrismaReadinessCheck } from './prisma.readiness';
import { PrismaService } from './prisma.service';

@Global()
@Module({
    providers: [PrismaService, PrismaReadinessCheck],
    exports: [PrismaService, PrismaReadinessCheck],
})
export class PrismaModule {}
