import { ZodValidationPipe } from 'nestjs-zod';
import {
    Controller,
    Post,
    Body,
    Req,
    Get,
    Put,
    Delete,
    Param,
    Query,
    UseInterceptors,
    UploadedFile,
    Headers,
    UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiTags,
    ApiResponse,
    ApiOperation,
    ApiExtraModels,
    ApiCookieAuth,
    ApiParam,
    ApiHeader,
} from '@nestjs/swagger';
import { AuthenticatedRequest, TurnstileService } from '@examio/common';
import { FlashcardsetService } from './flashcardset.service';
import { CreateFlashcardsetDto } from './dto/create-flashcardset.dto';
import { UpdateFlashcardSetDto } from './dto/update-flashcardset.dto';
import { GetFlashcardsetsDto } from './dto/get-flashcardset.dto';
import { SetFlashcardToFlashcardsetDto } from './dto/set-flashcard-to-flashcardset-dto';
import { SaveHistoryToFlashcardsetDto } from './dto/save-history-to-flashcardset.dto';
import {
    FlashcardSetUpdateSharingSettingsDto,
    FlashcardSetVerifyAccessCodeDto,
    FlashcardSetAccessCheckResponseDto,
    FlashcardSetVerifyCodeResponseDto,
    FlashcardSetSharingSettingsResponseDto,
    FlashcardSetPublicInfoDto,
} from './dto/sharing.dto';
import {
    CreateFlashCardSetResponseDto,
    UpdateFlashCardSetResponseDto,
    GetFlashCardSetsResponseDto,
    DeleteFlashCardSetResponseDto,
    SetFlashcardsToFlashcardSetResponseDto,
    FlashCardSetDto,
} from './dto/flashcardset-response.dto';
import {
    CreateFlashcardDto,
    UpdateFlashcardDto,
    CreateFlashcardResponseDto,
    UpdateFlashcardResponseDto,
    DeleteFlashcardResponseDto,
} from './dto/flashcard.dto';
import { GetFlashcardsDto } from './dto/get-flashcards.dto';
import {
    CreateFlashcardLabelDto,
    UpdateFlashcardLabelDto,
    AssignFlashcardsToLabelDto,
} from './dto/flashcard-label.dto';
import { createSetFormSchema, parseSetForm, updateSetFormSchema } from '../common/multipart-body';
import { Public, RequireOwnerOrPermission, RequirePermissions } from '@examio/auth-jwt';
import { FlashcardSetOwnerResolver } from './flashcardset-owner.resolver';
import { SearchQueryPipe, UserSearchService } from '../common/user-search.service';

@UsePipes(ZodValidationPipe)
@ApiTags('Flashcardsets')
@ApiExtraModels(
    CreateFlashcardsetDto,
    UpdateFlashcardSetDto,
    GetFlashcardsetsDto,
    CreateFlashCardSetResponseDto,
    UpdateFlashCardSetResponseDto,
    GetFlashCardSetsResponseDto,
    DeleteFlashCardSetResponseDto,
    SetFlashcardsToFlashcardSetResponseDto,
    FlashCardSetDto
)
@Controller('flashcardsets')
export class FlashcardsetController {
    constructor(
        private readonly flashcardsetService: FlashcardsetService,
        private readonly turnstileService: TurnstileService,
        private readonly userSearch: UserSearchService
    ) {}

    @Post()
    @RequirePermissions('flashcardset:manage')
    @UseInterceptors(FileInterceptor('thumbnail'))
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Create a new flashcard set (Teacher only)' })
    @ApiResponse({
        status: 201,
        description: 'Flashcard set created successfully',
        type: CreateFlashCardSetResponseDto,
    })
    async createFlashcardSet(
        @Req() req: AuthenticatedRequest,
        @UploadedFile() thumbnail?: Express.Multer.File
    ) {
        // Multer leaves the text fields on req.body: validate them with the zod schema (400 on bad input)
        const createFlashcardsetDto: CreateFlashcardsetDto = parseSetForm(
            createSetFormSchema,
            req.body
        );

        return this.flashcardsetService.createFlashcardSet(
            req.user,
            createFlashcardsetDto,
            thumbnail
        );
    }

    @Get('stats')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get flashcard set statistics' })
    @ApiResponse({
        status: 200,
        description: 'Flashcard set statistics retrieved successfully',
    })
    async getFlashcardSetStats(@Req() req: AuthenticatedRequest) {
        return this.flashcardsetService.getFlashcardSetStats(req.user);
    }

    @Get(':id')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get a flashcard set by ID' })
    @ApiResponse({
        status: 200,
        description: 'Flashcard set retrieved successfully',
        type: FlashCardSetDto,
    })
    async getFlashcardSetById(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.flashcardsetService.getFlashcardSetById(id, req.user);
    }

    @Get(':id/flashcards')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get paginated flashcards for a flashcard set' })
    @ApiParam({ name: 'id', description: 'Flashcard set ID' })
    @ApiResponse({
        status: 200,
        description: 'Flashcards retrieved successfully with pagination',
    })
    async getFlashcardSetFlashcards(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Query() query: GetFlashcardsDto
    ) {
        return this.flashcardsetService.getFlashcardSetFlashcards(
            id,
            req.user,
            query.page,
            query.limit,
            query.labelId
        );
    }

    @Put(':id')
    @RequirePermissions('flashcardset:manage')
    @UseInterceptors(FileInterceptor('thumbnail'))
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Update a flashcard set by ID (Teacher only)' })
    @ApiResponse({
        status: 200,
        description: 'Flashcard set updated successfully',
        type: UpdateFlashCardSetResponseDto,
    })
    async updateFlashcardSet(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @UploadedFile() thumbnail?: Express.Multer.File
    ) {
        // Multer leaves the text fields on req.body: validate them with the zod schema (400 on bad input)
        const updateFlashcardSetDto: UpdateFlashcardSetDto = parseSetForm(
            updateSetFormSchema,
            req.body
        );

        return this.flashcardsetService.updateFlashcardSet(
            id,
            req.user,
            updateFlashcardSetDto,
            thumbnail
        );
    }

    @Get()
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get a list of flashcard sets' })
    @ApiResponse({
        status: 200,
        description: 'Flashcard sets retrieved successfully',
        type: GetFlashCardSetsResponseDto,
    })
    async getFlashcardSets(
        @Req() req: AuthenticatedRequest,
        @Query() getFlashcardsetsDto: GetFlashcardsetsDto
    ) {
        return this.flashcardsetService.getFlashcardSets(
            req.user,
            getFlashcardsetsDto
        );
    }

    @Delete(':id')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Delete a flashcard set by ID (Teacher only)' })
    @ApiResponse({
        status: 200,
        description: 'Flashcard set deleted successfully',
        type: DeleteFlashCardSetResponseDto,
    })
    async deleteFlashcardSet(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.flashcardsetService.deleteFlashcardSet(id, req.user);
    }

    @Post(':id/share')
    @RequirePermissions('content:share')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Generate share link and access code for flashcard set' })
    @ApiResponse({
        status: 200,
        description: 'Share link generated successfully',
    })
    async generateShareLink(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.flashcardsetService.generateShareLink(id, req.user);
    }

    @Get('public/:id')
    @Public()
    @ApiOperation({ summary: 'Get a public flashcard set by ID' })
    @ApiResponse({
        status: 200,
        description: 'Public flashcard set retrieved successfully',
        type: FlashCardSetDto,
    })
    async getPublicFlashcardSetById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.flashcardsetService.getFlashcardSetPublicById(id, req.user?.id);
    }

    @Post('set-flashcards-to-flashcardset')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Set flashcards to a flashcard set' })
    @ApiResponse({
        status: 200,
        description: 'Flashcards set to flashcard set successfully',
        type: SetFlashcardsToFlashcardSetResponseDto,
    })
    async setFlashcardsToFlashcardset(
        @Req() req: AuthenticatedRequest,
        @Body() dto: SetFlashcardToFlashcardsetDto
    ) {
        return this.flashcardsetService.setFlashcardsToFlashcardSet(
            req.user,
            dto
        );
    }

    @Post('save-history-to-flashcardset')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({
        summary: 'Lưu flashcards từ history vào flashcard sets với label',
    })
    @ApiExtraModels(SaveHistoryToFlashcardsetDto)
    @ApiResponse({
        status: 201,
        type: SetFlashcardsToFlashcardSetResponseDto,
    })
    async saveHistoryToFlashcardSet(
        @Req() req: AuthenticatedRequest,
        @Body() dto: SaveHistoryToFlashcardsetDto
    ) {
        return this.flashcardsetService.saveHistoryToFlashcardSet(req.user, dto);
    }

    @Get(':flashcardSetId/labels')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get all labels for a flashcard set' })
    @ApiParam({ name: 'flashcardSetId', description: 'Flashcard set ID' })
    @ApiResponse({
        status: 200,
        description: 'Labels retrieved successfully',
    })
    async getLabels(
        @Req() req: AuthenticatedRequest,
        @Param('flashcardSetId') flashcardSetId: string
    ) {
        return this.flashcardsetService.getLabels(flashcardSetId, req.user);
    }

    @Post(':flashcardSetId/labels')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Create a new label for a flashcard set' })
    @ApiParam({ name: 'flashcardSetId', description: 'Flashcard set ID' })
    @ApiResponse({
        status: 201,
        description: 'Label created successfully',
    })
    async createLabel(
        @Req() req: AuthenticatedRequest,
        @Param('flashcardSetId') flashcardSetId: string,
        @Body() dto: CreateFlashcardLabelDto
    ) {
        return this.flashcardsetService.createLabel(flashcardSetId, req.user, dto);
    }

    @Put(':flashcardSetId/labels/:labelId')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Update a label' })
    @ApiParam({ name: 'flashcardSetId', description: 'Flashcard set ID' })
    @ApiParam({ name: 'labelId', description: 'Label ID' })
    @ApiResponse({
        status: 200,
        description: 'Label updated successfully',
    })
    async updateLabel(
        @Req() req: AuthenticatedRequest,
        @Param('flashcardSetId') flashcardSetId: string,
        @Param('labelId') labelId: string,
        @Body() dto: UpdateFlashcardLabelDto
    ) {
        return this.flashcardsetService.updateLabel(
            flashcardSetId,
            labelId,
            req.user,
            dto
        );
    }

    @Delete(':flashcardSetId/labels/:labelId')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Delete a label' })
    @ApiParam({ name: 'flashcardSetId', description: 'Flashcard set ID' })
    @ApiParam({ name: 'labelId', description: 'Label ID' })
    @ApiResponse({
        status: 200,
        description: 'Label deleted successfully',
    })
    async deleteLabel(
        @Req() req: AuthenticatedRequest,
        @Param('flashcardSetId') flashcardSetId: string,
        @Param('labelId') labelId: string
    ) {
        return this.flashcardsetService.deleteLabel(flashcardSetId, labelId, req.user);
    }

    @Post(':flashcardSetId/labels/:labelId/flashcards')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Assign flashcards to a label' })
    @ApiParam({ name: 'flashcardSetId', description: 'Flashcard set ID' })
    @ApiParam({ name: 'labelId', description: 'Label ID' })
    @ApiResponse({
        status: 200,
        description: 'Flashcards assigned to label successfully',
    })
    async assignFlashcardsToLabel(
        @Req() req: AuthenticatedRequest,
        @Param('flashcardSetId') flashcardSetId: string,
        @Param('labelId') labelId: string,
        @Body() dto: AssignFlashcardsToLabelDto
    ) {
        return this.flashcardsetService.assignFlashcardsToLabel(
            flashcardSetId,
            labelId,
            req.user,
            dto.flashcardIds
        );
    }

    @Delete(':flashcardSetId/labels/:labelId/flashcards')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Remove flashcards from a label' })
    @ApiParam({ name: 'flashcardSetId', description: 'Flashcard set ID' })
    @ApiParam({ name: 'labelId', description: 'Label ID' })
    @ApiResponse({
        status: 200,
        description: 'Flashcards removed from label successfully',
    })
    async removeFlashcardsFromLabel(
        @Req() req: AuthenticatedRequest,
        @Param('flashcardSetId') flashcardSetId: string,
        @Param('labelId') labelId: string,
        @Body() dto: AssignFlashcardsToLabelDto
    ) {
        return this.flashcardsetService.removeFlashcardsFromLabel(
            flashcardSetId,
            labelId,
            req.user,
            dto.flashcardIds
        );
    }

    @Get(':flashcardSetId/labels/:labelId/flashcards')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get flashcards by label' })
    @ApiParam({ name: 'flashcardSetId', description: 'Flashcard set ID' })
    @ApiParam({ name: 'labelId', description: 'Label ID' })
    @ApiResponse({
        status: 200,
        description: 'Flashcards retrieved successfully',
    })
    async getFlashcardsByLabel(
        @Req() req: AuthenticatedRequest,
        @Param('flashcardSetId') flashcardSetId: string,
        @Param('labelId') labelId: string,
        @Query() query: GetFlashcardsDto
    ) {
        return this.flashcardsetService.getFlashcardsByLabel(
            flashcardSetId,
            labelId,
            req.user,
            query
        );
    }

    // ==================== FLASHCARD CRUD ENDPOINTS ====================

    @Post(':flashcardSetId/flashcards')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Add a flashcard to a flashcard set' })
    @ApiParam({ name: 'flashcardSetId', description: 'Flashcard set ID' })
    @ApiResponse({
        status: 201,
        description: 'Flashcard added successfully',
        type: CreateFlashcardResponseDto,
    })
    async addFlashcard(
        @Req() req: AuthenticatedRequest,
        @Param('flashcardSetId') flashcardSetId: string,
        @Body() dto: CreateFlashcardDto
    ) {
        return this.flashcardsetService.addFlashcardToFlashcardSet(
            flashcardSetId,
            req.user,
            dto
        );
    }

    @Put(':flashcardSetId/flashcards/:flashcardId')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Update a flashcard in a flashcard set' })
    @ApiParam({ name: 'flashcardSetId', description: 'Flashcard set ID' })
    @ApiParam({ name: 'flashcardId', description: 'Flashcard ID' })
    @ApiResponse({
        status: 200,
        description: 'Flashcard updated successfully',
        type: UpdateFlashcardResponseDto,
    })
    async updateFlashcard(
        @Req() req: AuthenticatedRequest,
        @Param('flashcardSetId') flashcardSetId: string,
        @Param('flashcardId') flashcardId: string,
        @Body() dto: UpdateFlashcardDto
    ) {
        return this.flashcardsetService.updateFlashcardInFlashcardSet(
            flashcardSetId,
            flashcardId,
            req.user,
            dto
        );
    }

    @Delete(':flashcardSetId/flashcards/:flashcardId')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Delete a flashcard from a flashcard set' })
    @ApiParam({ name: 'flashcardSetId', description: 'Flashcard set ID' })
    @ApiParam({ name: 'flashcardId', description: 'Flashcard ID' })
    @ApiResponse({
        status: 200,
        description: 'Flashcard deleted successfully',
        type: DeleteFlashcardResponseDto,
    })
    async deleteFlashcard(
        @Req() req: AuthenticatedRequest,
        @Param('flashcardSetId') flashcardSetId: string,
        @Param('flashcardId') flashcardId: string
    ) {
        return this.flashcardsetService.deleteFlashcardFromFlashcardSet(
            flashcardSetId,
            flashcardId,
            req.user
        );
    }

    // ==================== SHARING & ACCESS ENDPOINTS ====================

    @Get('study/:id/access')
    @Public()
    @ApiOperation({ summary: 'Check access for a flashcard set' })
    @ApiParam({ name: 'id', description: 'Flashcard set ID' })
    @ApiResponse({
        status: 200,
        description: 'Access check result',
        type: FlashcardSetAccessCheckResponseDto,
    })
    async checkAccess(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.flashcardsetService.checkAccess(id, req.user?.id);
    }

    @Public()
    @Get('study/:id/info')
    @ApiOperation({ summary: 'Get public info for a flashcard set' })
    @ApiParam({ name: 'id', description: 'Flashcard set ID' })
    @ApiResponse({
        status: 200,
        description: 'Flashcard set public info',
        type: FlashcardSetPublicInfoDto,
    })
    async getPublicInfo(@Param('id') id: string) {
        return this.flashcardsetService.getFlashcardSetPublicInfo(id);
    }

    @Get('study/:id')
    @RequireOwnerOrPermission('flashcard:study', FlashcardSetOwnerResolver)
    @ApiOperation({ summary: 'Get flashcard set for study with access check' })
    @ApiParam({ name: 'id', description: 'Flashcard set ID' })
    @ApiResponse({
        status: 200,
        description: 'Flashcard set for study',
        type: FlashCardSetDto,
    })
    async getForStudy(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest,
        @Query('turnstileToken') turnstileToken?: string
    ) {
        if (turnstileToken) {
            await this.turnstileService.verify(turnstileToken);
        }
        return this.flashcardsetService.getFlashcardSetForStudy(
            id,
            req.user.id
        );
    }

    @RequirePermissions('flashcard:study')
    @Post('study/:id/verify-code')
    @ApiOperation({ summary: 'Verify access code for a private flashcard set' })
    @ApiParam({ name: 'id', description: 'Flashcard set ID' })
    @ApiResponse({
        status: 200,
        description: 'Code verification result',
        type: FlashcardSetVerifyCodeResponseDto,
    })
    async verifyCode(
        @Param('id') id: string,
        @Body() dto: FlashcardSetVerifyAccessCodeDto,
        @Req() req: AuthenticatedRequest
    ) {
        return this.flashcardsetService.verifyAccessCode(
            id,
            dto.accessCode,
            req.user.id
        );
    }

    @Post('study/:id/with-code')
    @RequirePermissions('flashcard:study')
    @ApiOperation({ summary: 'Get flashcard set using access code' })
    @ApiParam({ name: 'id', description: 'Flashcard set ID' })
    @ApiResponse({
        status: 200,
        description: 'Flashcard set for study',
        type: FlashCardSetDto,
    })
    async getWithCode(
        @Param('id') id: string,
        @Body() dto: FlashcardSetVerifyAccessCodeDto,
        @Req() req: AuthenticatedRequest
    ) {
        if (dto.turnstileToken) {
            await this.turnstileService.verify(dto.turnstileToken);
        }
        return this.flashcardsetService.getFlashcardSetWithCode(
            id,
            dto.accessCode,
            req.user.id
        );
    }

    @Get(':id/sharing')
    @RequirePermissions('content:share')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get sharing settings for a flashcard set' })
    @ApiParam({ name: 'id', description: 'Flashcard set ID' })
    @ApiResponse({
        status: 200,
        description: 'Sharing settings',
    })
    async getSharingSettings(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.flashcardsetService.getSharingSettings(id, req.user);
    }

    @Put(':id/sharing')
    @RequirePermissions('content:share')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Update sharing settings for a flashcard set' })
    @ApiParam({ name: 'id', description: 'Flashcard set ID' })
    @ApiResponse({
        status: 200,
        description: 'Sharing settings updated',
        type: FlashcardSetSharingSettingsResponseDto,
    })
    async updateSharingSettings(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest,
        @Body() dto: FlashcardSetUpdateSharingSettingsDto
    ) {
        return this.flashcardsetService.updateSharingSettings(
            id,
            req.user,
            dto
        );
    }

    @Post(':id/generate-code')
    @RequirePermissions('content:share')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Generate a new access code' })
    @ApiParam({ name: 'id', description: 'Flashcard set ID' })
    @ApiResponse({
        status: 200,
        description: 'New access code generated',
    })
    async generateCode(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.flashcardsetService.regenerateAccessCode(id, req.user);
    }

    @Get('users/search')
    @RequirePermissions('user:search')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Search users by username for whitelist' })
    @ApiResponse({
        status: 200,
        description: 'List of matching users',
    })
    async searchUsers(
        @Query('q', SearchQueryPipe) query: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.userSearch.search(query, req.user.id);
    }
}
