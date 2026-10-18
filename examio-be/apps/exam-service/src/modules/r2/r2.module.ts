import { Module } from '@nestjs/common';
import { R2Controller } from './r2.controller';
import { R2UploadService } from './r2-upload.service';
import { AuthModule } from '@examio/common';
import { GrpcClientModule } from '@examio/grpc';
import { R2_GRPC_REGISTRATION, R2Client } from '../../clients/r2.client';

@Module({
    imports: [AuthModule, GrpcClientModule.register(R2_GRPC_REGISTRATION)],
    controllers: [R2Controller],
    providers: [R2UploadService, R2Client],
    exports: [R2UploadService],
})
export class R2Module {}
