import { Controller, Get } from '@nestjs/common';
import { AuthServiceService } from './auth-service.service';
import { Public } from '@kmaedu/auth-jwt';

@Controller()
export class AuthServiceController {
  constructor(private readonly authServiceService: AuthServiceService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.authServiceService.getHello();
  }
}
