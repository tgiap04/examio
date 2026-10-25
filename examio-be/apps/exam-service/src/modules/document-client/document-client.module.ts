import { Global, Module } from '@nestjs/common';
import { GrpcClientModule } from '@examio/grpc';
import { DOCUMENT_GRPC_REGISTRATION, DocumentClient } from '../../clients/document.client';

/** One document-service channel for every exam module (ai generation, exam attempts). */
@Global()
@Module({
    imports: [GrpcClientModule.register(DOCUMENT_GRPC_REGISTRATION)],
    providers: [DocumentClient],
    exports: [DocumentClient],
})
export class DocumentClientModule {}
