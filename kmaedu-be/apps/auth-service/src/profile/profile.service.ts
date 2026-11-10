import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { User } from '../prisma';
import { GenerateIdService, ownerKeyFolder, sanitizeFilename } from '@kmaedu/common';
import { buildMetadata } from '@kmaedu/grpc';
import { r2V1 } from '@kmaedu/contracts';
import { R2Client } from '../clients/r2.client';
import { UserRepository } from '../repositories/user.repository';
import { UserProfilePatch, UserUpdateWriter } from '../users-admin/user-update.writer';
import { UpdateProfileDto, ProfileResponseDto } from './dto/profile.dto';

@Injectable()
export class ProfileService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly generateIdService: GenerateIdService,
        private readonly r2Client: R2Client,
        private readonly userUpdates: UserUpdateWriter
    ) {}

    /**
     * Get user profile - O(1) with cache
     */
    async getProfile(user: { id: string }): Promise<ProfileResponseDto> {
        const userData = await this.userRepository.findByIdWithRelations(
            user.id,
            [],
            true
        );

        if (!userData) {
            throw new NotFoundException('Không tìm thấy người dùng');
        }

        return this.sanitizeProfile(userData);
    }

    /**
     * Update user profile - invalidates cache
     */
    async updateProfile(
        user: { id: string },
        dto: UpdateProfileDto
    ): Promise<ProfileResponseDto> {
        const updateData: UserProfilePatch = {};

        if (dto.name !== undefined) {
            updateData.name = dto.name;
        }
        if (dto.bio !== undefined) {
            updateData.bio = dto.bio;
        }
        if (dto.avatar !== undefined) {
            updateData.avatar = dto.avatar;
        }
        if (dto.banner !== undefined) {
            updateData.banner = dto.banner;
        }

        const result = await this.userUpdates.update(
            user.id,
            updateData,
            user.id
        );
        if (!result) throw new NotFoundException('Không tìm thấy người dùng');

        return this.sanitizeProfile(result.user);
    }

    /**
     * Upload profile image (avatar or banner) via gRPC to R2 Service
     */
    async uploadProfileImage(
        user: { id: string },
        file: Express.Multer.File,
        type: 'avatar' | 'banner'
    ): Promise<{ url: string }> {
        // Validate file type
        const supportedMimeTypes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
        ];
        if (!file.mimetype || !supportedMimeTypes.includes(file.mimetype)) {
            throw new BadRequestException(
                'Chỉ hỗ trợ ảnh định dạng JPEG, PNG, GIF, WebP'
            );
        }

        // Validate file size
        const maxSize = type === 'avatar' ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new BadRequestException(
                `Kích thước ảnh tối đa là ${type === 'avatar' ? '2MB' : '5MB'}`
            );
        }

        // Generate unique filename
        const sanitizedName = sanitizeFilename(file.originalname);
        const filename = `${this.generateIdService.generateId()}-${sanitizedName}`;
        // Owner-scoped key `<area>/<userId>/<id>-<name>`: only the key's owner may ever
        // have it deleted when the image is replaced.
        const directory = ownerKeyFolder(
            type === 'avatar' ? 'avatars' : 'banners',
            user.id
        );

        // Upload via gRPC to R2 Service
        let uploadResult: r2V1.UploadFileResponse | undefined;
        try {
            console.log('Calling R2 gRPC uploadFile with:', {
                userId: user.id,
                filename,
                mimetype: file.mimetype,
                contentLength: file.buffer.length,
                folder: directory,
            });

            uploadResult = await this.r2Client.uploadFile(
                {
                    userId: user.id,
                    filename,
                    mimetype: file.mimetype,
                    content: file.buffer,
                    folder: directory,
                },
                buildMetadata()
            );

            console.log('R2 gRPC uploadFile result:', uploadResult);
        } catch (error) {
            console.error('R2 gRPC uploadFile error:', error);
            throw new BadRequestException(
                `R2 service error: ${error.message || 'Failed to connect to R2 service. Make sure r2-service is running.'}`
            );
        }

        if (!uploadResult) {
            throw new BadRequestException(
                'R2 service returned no result. Make sure r2-service is running.'
            );
        }

        if (!uploadResult.success) {
            throw new BadRequestException(
                `Upload failed: ${uploadResult.message || 'Unknown error from R2 service'}`
            );
        }

        const url = uploadResult.url;

        // Update user profile with new URL
        const updateData: UserProfilePatch =
            type === 'avatar' ? { avatar: url } : { banner: url };

        await this.userUpdates.update(user.id, updateData, user.id);

        // The replaced avatar/banner object was queued for deletion by the
        // update above, in the same transaction.

        return { url };
    }

    /**
     * Remove sensitive fields from user data
     */
    private sanitizeProfile(user: User): ProfileResponseDto {
        return {
            id: user.id,
            email: user.email,
            username: user.username,
            name: user.name,
            avatar: user.avatar,
            banner: user.banner,
            bio: user.bio,
            isVerified: user.isVerified,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }
}
