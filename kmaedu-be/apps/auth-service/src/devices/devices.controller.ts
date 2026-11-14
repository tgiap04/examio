import {
    Controller,
    Get,
    Delete,
    Post,
    Param,
    Req,
} from '@nestjs/common';
import { DevicesService } from './devices.service';
import { AllowUnverified, Authenticated, type AuthUser } from '@kmaedu/auth-jwt';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

@ApiTags('Devices')
@Controller('devices')
@Authenticated()
@AllowUnverified()
export class DevicesController {
    constructor(private readonly devicesService: DevicesService) {}

    @Get()
    @ApiOperation({ summary: 'Get list of logged-in devices' })
    @ApiResponse({ status: 200, description: 'List of devices' })
    async getDevices(@Req() req: AuthenticatedRequest) {
        return this.devicesService.getDevices(req.user.id, req.user.sid);
    }

    @Delete(':sessionId')
    @ApiOperation({ summary: 'Logout a specific device' })
    @ApiResponse({ status: 200, description: 'Device logged out' })
    async logoutDevice(
        @Param('sessionId') sessionId: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.devicesService.logoutDevice(
            req.user.id,
            sessionId,
            req.user.sid
        );
    }

    @Post('logout-all-others')
    @ApiOperation({ summary: 'Logout all other devices' })
    @ApiResponse({ status: 200, description: 'All other devices logged out' })
    async logoutAllOthers(@Req() req: AuthenticatedRequest) {
        return this.devicesService.logoutAllOthers(req.user.id, req.user.sid);
    }
}
