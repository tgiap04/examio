import { Module } from '@nestjs/common';
import { StudentContentController } from './student-content.controller';
import { StudentContentService } from './student-content.service';
import { PrismaModule } from '../../prisma';

@Module({
    imports: [PrismaModule],
    controllers: [StudentContentController],
    providers: [StudentContentService],
    exports: [StudentContentService],
})
export class StudentContentModule {}
