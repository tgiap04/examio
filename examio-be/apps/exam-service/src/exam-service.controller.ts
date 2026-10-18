import { Controller, Get } from '@nestjs/common';
import { ExamServiceService } from './exam-service.service';
import { Public } from '@examio/auth-jwt';

@Controller()
export class ExamServiceController {
  constructor(private readonly examServiceService: ExamServiceService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.examServiceService.getHello();
  }
}
