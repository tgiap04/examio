import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';
import { SharingDeltaSchema } from '../../common/sharing-list.util';

/** `PUT /quizsets/:id/sharing`: deltas applied in one atomic statement. */
export class QuizSetSharingDeltaDto extends createZodDto(SharingDeltaSchema) {
    @ApiProperty({ type: [String], required: false, description: 'User ids to add to the whitelist (max 2000)' })
    addUserIds?: string[];

    @ApiProperty({ type: [String], required: false, description: 'User ids to remove from the whitelist and from the code-granted list (max 2000)' })
    removeUserIds?: string[];

    @ApiProperty({ type: [String], required: false, description: 'User ids whose code unlock is revoked; their whitelist grant stays (max 2000)' })
    removeCodeGrantedIds?: string[];

    @ApiProperty({ required: false, description: 'Visibility only; lists and code are kept' })
    isPublic?: boolean;

    @ApiProperty({ required: false, description: 'true: make sure a code exists; false: remove it and evict code users' })
    codeEnabled?: boolean;
}

export class QuizSetGenerateCodeResponseDto {
    @ApiProperty({ example: '482913' })
    accessCode: string;
}
