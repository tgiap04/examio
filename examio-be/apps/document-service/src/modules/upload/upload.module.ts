import { Module } from '@nestjs/common';
import { DocumentDomainModule } from './document-domain.module';
import { DocumentGrpcController } from './document.grpc.controller';
import { ImageUploadService } from './image-upload.service';
import { R2ImageController } from './r2-image.controller';
import { UploadController } from './upload.controller';

@Module({
    imports: [DocumentDomainModule],
    controllers: [UploadController, R2ImageController, DocumentGrpcController],
    providers: [ImageUploadService],
})
export class UploadModule {}
