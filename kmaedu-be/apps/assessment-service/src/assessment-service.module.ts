import { Module } from '@nestjs/common';
import { AuthJwtModule } from '@kmaedu/auth-jwt';
import { HealthModule, LoggerModule } from '@kmaedu/observability';
import { RedisModule, RedisReadinessCheck } from '@kmaedu/redis';
import { PrismaModule, PrismaReadinessCheck } from './prisma';
import { CheatingLogModule } from './modules/cheatinglog/cheatinglog.module';
import { ContentClientModule } from './modules/content-client/content-client.module';
import { DocumentClientModule } from './modules/document-client/document-client.module';
import { ExamAttemptModule } from './modules/examattempt/examattempt.module';
import { ExamRoomModule } from './modules/examroom/examroom.module';
import { ExamSessionModule } from './modules/examsession/examsession.module';
import { SnapshotModule } from './modules/snapshot/snapshot.module';
import { StudentExamModule } from './modules/student-exam/student-exam.module';
import { UserProfileModule } from './modules/user-profile/user-profile.module';
import { QuizSetEventsModule } from './modules/quizset-events/quizset-events.module';

@Module({
    imports: [
        LoggerModule.forRoot('assessment-service'),
        HealthModule.forRoot({
            checks: [PrismaReadinessCheck, RedisReadinessCheck],
        }),
        PrismaModule,
        RedisModule,
        // Service identity `assessment` (token subject `svc:assessment`): the name this service asks auth
        // to sign tokens for. User tokens, and the teacher's token it forwards to content, are verified
        // against auth's JWKS.
        AuthJwtModule.forRoot({ serviceName: 'assessment', serviceClient: true }),
        ContentClientModule,
        DocumentClientModule,
        SnapshotModule,
        // Consumes `assessment.events` (content.quizset.deleted, auth.user.updated): the handlers only
        // touch this service's own database and cache, so the consumer runs in the API process.
        UserProfileModule,
        QuizSetEventsModule,
        ExamRoomModule,
        ExamSessionModule,
        ExamAttemptModule,
        CheatingLogModule,
        StudentExamModule,
    ],
})
export class AssessmentServiceModule {}
