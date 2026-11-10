import { Module } from '@nestjs/common';
import { QuizsetModule } from '../modules/quizset/quizset.module';
import { ContentGrpcController } from './content.grpc.controller';

/** The gRPC face of content (`examio.content.v1.ContentService`), served next to the HTTP routes. */
@Module({
    imports: [QuizsetModule],
    controllers: [ContentGrpcController],
})
export class ContentGrpcModule {}
