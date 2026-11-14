import { Global, Module } from '@nestjs/common';
import { GrpcClientModule } from '@kmaedu/grpc';
import { DOCUMENT_GRPC_REGISTRATION, DocumentClient } from '@kmaedu/grpc';

/** One document-service channel for every content module (ai generation). */
@Global()
@Module({
    imports: [GrpcClientModule.register(DOCUMENT_GRPC_REGISTRATION)],
    providers: [DocumentClient],
    exports: [DocumentClient],
})
export class DocumentClientModule {}
