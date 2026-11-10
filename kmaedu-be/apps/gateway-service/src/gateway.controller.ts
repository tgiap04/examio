import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '@kmaedu/auth-jwt';

@ApiTags('Gateway')
@Controller()
export class GatewayController {
    @Get('status')
    @Public()
    @ApiOperation({ summary: 'Get all services status' })
    @ApiResponse({ status: 200, description: 'Services status' })
    async getStatus() {
        return {
            gateway: 'running',
            services: {
                auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
                content:
                    process.env.CONTENT_SERVICE_URL || 'http://localhost:3013',
                assessment:
                    process.env.ASSESSMENT_SERVICE_URL || 'http://localhost:3014',
                studyroom:
                    process.env.STUDYROOM_SERVICE_URL || 'http://localhost:3009',
                vocabulary:
                    process.env.VOCABULARY_SERVICE_URL || 'http://localhost:3010',
                document:
                    process.env.DOCUMENT_SERVICE_URL || 'http://localhost:3011',
                aichat:
                    process.env.AICHAT_SERVICE_URL || 'http://localhost:3012',
            },
            timestamp: new Date().toISOString(),
        };
    }
}
