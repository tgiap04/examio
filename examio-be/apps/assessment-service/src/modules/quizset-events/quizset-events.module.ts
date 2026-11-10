import { Module } from '@nestjs/common';
import { ExamRoomModule } from '../examroom/examroom.module';
import { QuizSetDeletedHandler } from './quizset-deleted.handler';

/** Consumer-side handlers of content-service events (bound by `UserProfileModule`'s MessagingModule). */
@Module({
    imports: [ExamRoomModule],
    providers: [QuizSetDeletedHandler],
})
export class QuizSetEventsModule {}
