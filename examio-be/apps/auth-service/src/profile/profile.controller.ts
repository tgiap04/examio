import {
    Controller,
    Req,
    Get,
    Put,
    Body,
    Post,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiResponse,
    ApiOperation,
    ApiCookieAuth,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { Authenticated } from '@examio/auth-jwt';
import { ProfileService } from './profile.service';
import { AuthenticatedRequest } from '../dto/request-with-auth.dto';
import { UpdateProfileDto, ProfileResponseDto } from './dto/profile.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Profile')
@Controller('profile')
export class ProfileController {
    constructor(private readonly profileService: ProfileService) {}

    @Get()
    @Authenticated()
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy thông tin hồ sơ người dùng' })
    @ApiResponse({
        status: 200,
        description: 'Thông tin hồ sơ',
        type: ProfileResponseDto,
    })
    async getProfile(@Req() req: AuthenticatedRequest) {
        return this.profileService.getProfile(req.user);
    }

    @Put()
    @Authenticated()
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Cập nhật hồ sơ người dùng' })
    @ApiResponse({
        status: 200,
        description: 'Hồ sơ đã được cập nhật',
        type: ProfileResponseDto,
    })
    async updateProfile(
        @Req() req: AuthenticatedRequest,
        @Body() dto: UpdateProfileDto
    ) {
        return this.profileService.updateProfile(req.user, dto);
    }

    @Post('upload-avatar')
    @Authenticated()
    @ApiCookieAuth('cookie-auth')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Ảnh đại diện (max 2MB)',
                },
            },
        },
    })
    @ApiOperation({ summary: 'Upload ảnh đại diện' })
    @ApiResponse({ status: 200, description: 'URL ảnh đã upload' })
    async uploadAvatar(
        @Req() req: AuthenticatedRequest,
        @UploadedFile() file: Express.Multer.File
    ) {
        if (!file) {
            throw new BadRequestException('Chưa chọn file');
        }
        return this.profileService.uploadProfileImage(req.user, file, 'avatar');
    }

    @Post('upload-banner')
    @Authenticated()
    @ApiCookieAuth('cookie-auth')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Ảnh bìa (max 5MB)',
                },
            },
        },
    })
    @ApiOperation({ summary: 'Upload ảnh bìa' })
    @ApiResponse({ status: 200, description: 'URL ảnh đã upload' })
    async uploadBanner(
        @Req() req: AuthenticatedRequest,
        @UploadedFile() file: Express.Multer.File
    ) {
        if (!file) {
            throw new BadRequestException('Chưa chọn file');
        }
        return this.profileService.uploadProfileImage(req.user, file, 'banner');
    }
}
