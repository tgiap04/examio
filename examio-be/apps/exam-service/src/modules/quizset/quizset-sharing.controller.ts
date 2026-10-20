import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    Query,
    Req,
    UsePipes,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequirePermissions } from '@examio/auth-jwt';
import { AuthenticatedRequest } from '@examio/common';
import { SearchQueryPipe, UserSearchService } from '../common/user-search.service';
import { QuizSetSharingDeltaDto } from './dto/quizset-sharing.dto';
import { QuizsetSharingService } from './quizset-sharing.service';

/** Teacher sharing of a quiz set (public / whitelist / invite code). Routes never collide with `:id`. */
@UsePipes(ZodValidationPipe)
@ApiTags('Quizset sharing')
@ApiCookieAuth('cookie-auth')
@Controller('quizsets')
export class QuizsetSharingController {
    constructor(
        private readonly sharing: QuizsetSharingService,
        private readonly userSearch: UserSearchService
    ) {}

    @Get('users/search')
    @RequirePermissions('user:search')
    @ApiOperation({ summary: 'Search users for the whitelist picker (no email returned)' })
    searchUsers(
        @Query('q', SearchQueryPipe) query: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.userSearch.search(query, req.user.id);
    }

    @Get(':id/sharing')
    @RequirePermissions('content:share')
    @ApiOperation({ summary: 'Sharing settings of an owned quiz set' })
    @ApiParam({ name: 'id', description: 'Quiz set ID' })
    getSharing(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.sharing.getSharing(id, req.user);
    }

    @Put(':id/sharing')
    @RequirePermissions('content:share')
    @ApiOperation({ summary: 'Apply a sharing delta atomically (add/remove users, visibility, code on/off)' })
    @ApiParam({ name: 'id', description: 'Quiz set ID' })
    updateSharing(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest,
        @Body() dto: QuizSetSharingDeltaDto
    ) {
        return this.sharing.updateSharing(id, req.user, dto);
    }

    @Post(':id/generate-code')
    @HttpCode(200)
    @RequirePermissions('content:share')
    @ApiOperation({ summary: 'Rotate the invite code (evicts everyone who unlocked with the old one)' })
    @ApiParam({ name: 'id', description: 'Quiz set ID' })
    generateCode(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.sharing.generateCode(id, req.user);
    }
}
