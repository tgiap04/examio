import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Put,
    Req,
    UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { AdminWordFamilyService, AuditContext } from './admin-word-family.service';
import { CreateCategoryBodyDto } from './dto/create-category.body';
import { UpdateCategoryBodyDto } from './dto/update-category.body';
import { RequirePermissions, forwardUser } from '@kmaedu/auth-jwt';

interface AuthedAdminRequest extends Request {
    user?: { id: string };
}

@ApiTags('Admin / Word Family')
@ApiBearerAuth()
@Controller('admin/word-family')
@RequirePermissions('word_family:admin')
@Throttle({ admin: { ttl: 60000, limit: 30 } })
@UsePipes(ZodValidationPipe)
export class AdminWordFamilyController {
    constructor(private readonly wfService: AdminWordFamilyService) {}

    @Get('categories')
    @ApiOperation({ summary: 'List all word family categories (admin view)' })
    async listCategories(@Req() req: AuthedAdminRequest) {
        return this.wfService.listCategories(forwardUser(req));
    }

    @Post('categories')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a word family category' })
    async createCategory(
        @Body() body: CreateCategoryBodyDto,
        @Req() req: AuthedAdminRequest,
    ) {
        return this.wfService.createCategory(body, this.buildAuditContext(req), forwardUser(req));
    }

    @Put('categories/:id')
    @ApiOperation({ summary: 'Update a word family category' })
    @ApiParam({ name: 'id', description: 'Category ID' })
    async updateCategory(
        @Param('id') id: string,
        @Body() body: UpdateCategoryBodyDto,
        @Req() req: AuthedAdminRequest,
    ) {
        return this.wfService.updateCategory(
            id,
            body,
            this.buildAuditContext(req),
            forwardUser(req),
        );
    }

    @Delete('categories/:id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Soft-delete a word family category' })
    @ApiParam({ name: 'id', description: 'Category ID' })
    async deleteCategory(
        @Param('id') id: string,
        @Req() req: AuthedAdminRequest,
    ) {
        return this.wfService.deleteCategory(id, this.buildAuditContext(req), forwardUser(req));
    }

    private buildAuditContext(req: AuthedAdminRequest): AuditContext {
        const adminId = req.user?.id;
        if (!adminId) {
            throw new Error('admin principal missing on request.user');
        }

        const headers = req.headers ?? {};
        const xff = headers['x-forwarded-for'];
        const ip =
            (Array.isArray(xff) ? xff[0] : xff?.split(',')[0]?.trim()) ||
            req.ip ||
            null;

        const ua = headers['user-agent'];
        const userAgent = Array.isArray(ua) ? ua[0] : ua ?? null;

        return { adminId, ipAddress: ip, userAgent };
    }
}
