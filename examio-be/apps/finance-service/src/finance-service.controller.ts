import { Controller, Get } from '@nestjs/common';
import { FinanceServiceService } from './finance-service.service';
import { Public } from '@examio/auth-jwt';

@Controller()
export class FinanceServiceController {
  constructor(private readonly financeServiceService: FinanceServiceService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.financeServiceService.getHello();
  }
}
