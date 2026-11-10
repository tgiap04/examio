import { Global, Module } from '@nestjs/common';
import { DOCUMENT_GRPC_REGISTRATION, DocumentClient, GrpcClientModule } from '@examio/grpc';

/** One document-service channel (the history stats read the caller's upload count). */
@Global()
@Module({
    imports: [GrpcClientModule.register(DOCUMENT_GRPC_REGISTRATION)],
    providers: [DocumentClient],
    exports: [DocumentClient],
})
export class DocumentClientModule {}
