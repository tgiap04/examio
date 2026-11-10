import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';
import { SharingDeltaSchema } from '../../common/sharing-list.util';

// DTO for updating sharing settings: deltas, applied atomically (same contract as quiz sets)
export class FlashcardSetUpdateSharingSettingsDto extends createZodDto(
    SharingDeltaSchema
) {
    @ApiProperty({ type: [String], required: false, description: 'User ids to add to the whitelist (max 2000)' })
    addUserIds?: string[];

    @ApiProperty({ type: [String], required: false, description: 'User ids to remove from the whitelist and the code-granted list (max 2000)' })
    removeUserIds?: string[];

    @ApiProperty({ type: [String], required: false, description: 'User ids whose code unlock is revoked; their whitelist grant stays (max 2000)' })
    removeCodeGrantedIds?: string[];

    @ApiProperty({ required: false, description: 'Visibility only; lists and code are kept' })
    isPublic?: boolean;

    @ApiProperty({ required: false, description: 'true: make sure a code exists; false: remove it and evict code users' })
    codeEnabled?: boolean;
}

// DTO for verifying access code
export const FlashcardSetVerifyAccessCodeSchema = z.object({
    accessCode: z.string().regex(/^\d{6}$/),
    turnstileToken: z.string().optional(),
});

export class FlashcardSetVerifyAccessCodeDto extends createZodDto(FlashcardSetVerifyAccessCodeSchema) {
    @ApiProperty({
        description: '6-digit access code to verify',
        example: '123456',
    })
    accessCode: string;

    @ApiProperty({
        description: 'Cloudflare Turnstile token for bot protection',
        required: false,
    })
    turnstileToken?: string;
}

// Response DTOs
export class FlashcardSetSharingSettingsResponseDto {
    @ApiProperty({ example: true })
    isPublic: boolean;

    @ApiProperty({ example: '123456', required: false, nullable: true })
    accessCode: string | null;

    @ApiProperty({ description: 'Whitelisted users { id, username, name, avatar }', type: [Object] })
    whitelist: object[];

    @ApiProperty({ description: 'Users who unlocked the current code', type: [Object] })
    codeGranted: object[];
}

export class FlashcardSetAccessCheckResponseDto {
    @ApiProperty({ example: true })
    hasAccess: boolean;

    @ApiProperty({ example: 'public' })
    accessType: 'public' | 'owner' | 'whitelist' | 'code_required' | 'denied';

    @ApiProperty({ example: true, required: false })
    requiresCode?: boolean;
}

export class FlashcardSetVerifyCodeResponseDto {
    @ApiProperty({ example: true })
    valid: boolean;

    @ApiProperty({ example: 'Mã xác thực hợp lệ' })
    message: string;
}

export class FlashcardSetPublicInfoDto {
    @ApiProperty({ example: 'abc123' })
    id: string;

    @ApiProperty({ example: 'Bộ thẻ tiếng Anh' })
    title: string;

    @ApiProperty({ example: 'Bộ thẻ cơ bản' })
    description?: string;

    @ApiProperty({ example: 'https://example.com/thumb.jpg' })
    thumbnail?: string;

    @ApiProperty({ example: 100 })
    viewCount: number;

    @ApiProperty({ example: 50 })
    cardCount: number;

    @ApiProperty({
        example: {
            id: 'user123',
            username: 'john_doe',
            name: 'John Doe',
            avatar: 'https://example.com/avatar.jpg',
        },
    })
    creator: {
        id: string;
        username: string;
        name: string | null;
        avatar: string | null;
    };

    @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
    createdAt: string;
}
