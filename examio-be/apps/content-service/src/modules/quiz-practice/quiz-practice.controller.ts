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
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import {
    Authenticated,
    Public,
    RequireOwnerOrPermission,
    RequirePermissions,
} from '@examio/auth-jwt';
import { AuthenticatedRequest } from '@examio/common';
import { QuizSetOwnerResolver } from '../quizset/quizset-owner.resolver';
import {
    ListAttemptsQueryDto,
    ListSetsQueryDto,
    SaveAttemptDto,
    StartAttemptDto,
    UnlockQuizSetDto,
} from './dto/quiz-practice.dto';
import { QuizPracticeAttemptService } from './quiz-practice-attempt.service';
import { QuizPracticeService } from './quiz-practice.service';

/** Student practice flow. Attempt endpoints are `@Authenticated` + owner-in-`where` (see the allowlist spec). */
@UsePipes(ZodValidationPipe)
@ApiTags('Quiz practice')
@ApiCookieAuth('cookie-auth')
@Controller('quiz-practice')
export class QuizPracticeController {
    constructor(
        private readonly practice: QuizPracticeService,
        private readonly attempts: QuizPracticeAttemptService
    ) {}

    @Get('sets')
    @RequirePermissions('quiz:practice')
    @ApiOperation({ summary: 'Quiz sets shared with me (whitelist / code / public with attempts)' })
    listSets(@Req() req: AuthenticatedRequest, @Query() query: ListSetsQueryDto) {
        return this.practice.listSets(req.user, query);
    }

    @Get('sets/:id/access')
    @Public()
    @ApiOperation({ summary: 'Can I practise this set, or do I need its code? (token optional)' })
    getAccess(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.practice.getAccess(id, req.user?.id);
    }

    @Post('sets/:id/unlock')
    @HttpCode(200)
    @RequirePermissions('quiz:practice')
    @ApiOperation({ summary: 'Unlock a set with its invite code (5 wrong codes lock for 15 minutes)' })
    unlock(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest,
        @Body() dto: UnlockQuizSetDto
    ) {
        return this.practice.unlock(id, req.user, dto.code);
    }

    @Post('attempts')
    @RequireOwnerOrPermission('quiz:practice', QuizSetOwnerResolver)
    @ApiOperation({ summary: 'Start or resume an attempt (questions come without answers)' })
    startAttempt(@Req() req: AuthenticatedRequest, @Body() dto: StartAttemptDto) {
        return this.practice.startAttempt(req.user, dto.quizSetId);
    }

    @Get('attempts')
    @Authenticated()
    @ApiOperation({ summary: 'My submitted attempts, newest first' })
    listAttempts(@Req() req: AuthenticatedRequest, @Query() query: ListAttemptsQueryDto) {
        return this.attempts.listAttempts(req.user, query);
    }

    @Get('attempts/:id')
    @Authenticated()
    @ApiOperation({ summary: 'One of my attempts (answers revealed only after submit)' })
    getAttempt(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.attempts.getAttempt(req.user, id);
    }

    @Put('attempts/:id')
    @Authenticated()
    @ApiOperation({ summary: 'Autosave progress of an open attempt' })
    saveAttempt(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest,
        @Body() dto: SaveAttemptDto
    ) {
        return this.attempts.saveAttempt(req.user, id, dto);
    }

    @Post('attempts/:id/submit')
    @HttpCode(200)
    @Authenticated()
    @ApiOperation({ summary: 'Submit: the server scores from the stored answers' })
    submitAttempt(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
        return this.attempts.submitAttempt(req.user, id);
    }
}
