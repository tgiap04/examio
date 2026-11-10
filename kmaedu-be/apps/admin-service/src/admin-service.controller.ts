import { Controller, Get } from '@nestjs/common';
import { AdminServiceService } from './admin-service.service';
import { Public } from '@kmaedu/auth-jwt';

@Controller()
export class AdminServiceController {
    constructor(
        private readonly adminServiceService: AdminServiceService
    ) {}

    @Public()
    @Get()
    getHello(): string {
        return this.adminServiceService.getHello();
    }
}
