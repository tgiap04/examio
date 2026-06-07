import { Controller, Get } from '@nestjs/common';
import { AdminServiceService } from './admin-service.service';

@Controller()
export class AdminServiceController {
    constructor(
        private readonly adminServiceService: AdminServiceService
    ) {}

    @Get('health')
    health() {
        return { status: 'ok', service: 'admin-service' };
    }

    @Get()
    getHello(): string {
        return this.adminServiceService.getHello();
    }
}
