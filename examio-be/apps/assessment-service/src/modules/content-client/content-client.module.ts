import { Global, Module } from '@nestjs/common';
import { GrpcClientModule } from '@examio/grpc';
import { CONTENT_GRPC_REGISTRATION, ContentClient } from '../../clients/content.client';

/** One content-service channel for every assessment module. */
@Global()
@Module({
    imports: [GrpcClientModule.register(CONTENT_GRPC_REGISTRATION)],
    providers: [ContentClient],
    exports: [ContentClient],
})
export class ContentClientModule {}
