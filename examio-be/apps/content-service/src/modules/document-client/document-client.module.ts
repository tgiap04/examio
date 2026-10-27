import { Global, Module } from '@nestjs/common';
import { GrpcClientModule } from '@examio/grpc';
import { DOCUMENT_GRPC_REGISTRATION, DocumentClient } from '@examio/grpc';

/** One document-service channel for every content module (ai generation). */
@Global()
@Module({
    imports: [GrpcClientModule.register(DOCUMENT_GRPC_REGISTRATION)],
    providers: [DocumentClient],
    exports: [DocumentClient],
})
export class DocumentClientModule {}
