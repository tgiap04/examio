import { Module } from '@nestjs/common';
import { StudentExamController } from './student-exam.controller';
import { StudentExamService } from './student-exam.service';
import { PrismaModule } from '../../prisma';

@Module({
    imports: [PrismaModule],
    controllers: [StudentExamController],
    providers: [StudentExamService],
    exports: [StudentExamService],
})
export class StudentExamModule {}
