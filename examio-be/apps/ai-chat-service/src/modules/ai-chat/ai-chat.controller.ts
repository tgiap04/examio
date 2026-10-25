import { ZodValidationPipe } from 'nestjs-zod';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UsePipes } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthenticatedRequest } from '@examio/common';
import { extractHttpToken, RequirePermissions } from '@examio/auth-jwt';
import { requireUserToken } from '../../clients/document.client';
import {
    AddDocumentDto,
    ClearChatDto,
    CreateChatDto,
    DeleteChatQueryDto,
    EditMessageDto,
    RenameChatDto,
    SendMessageDto,
} from './dto/ai-chat.dto';
import { AIChatService } from './ai-chat.service';
import { AIChatAnswerService } from './ai-chat-answer.service';
import { AIChatDeletionService } from './ai-chat-deletion.service';
import { AIChatDocumentsService } from './ai-chat-documents.service';
import { AIChatStreamService } from './ai-chat-stream.service';
import { SseResponse } from './sse-response';

/** The caller's access token (cookie or bearer): forwarded to document-service and finance, which act as the caller. */
const tokenOf = (req: AuthenticatedRequest): string => requireUserToken(extractHttpToken(req));

/**
 * Every route needs `ai_chat:use`; the service then checks the chat (or message) is the caller's and
 * answers 404 when it is not, so another user's id looks exactly like a missing one.
 */
@UsePipes(ZodValidationPipe)
@ApiTags('AI Chat')
@Controller('ai-chat')
@RequirePermissions('ai_chat:use')
@ApiCookieAuth('cookie-auth')
export class AIChatController {
    constructor(
        private readonly chats: AIChatService,
        private readonly answers: AIChatAnswerService,
        private readonly streams: AIChatStreamService,
        private readonly documents: AIChatDocumentsService,
        private readonly deletion: AIChatDeletionService
    ) {}

    // ==================== CHAT ====================

    @Get()
    @ApiOperation({ summary: 'Lấy danh sách chats' })
    getChats(@Req() req: AuthenticatedRequest) {
        return this.chats.getChats(req.user);
    }

    @Post()
    @ApiOperation({ summary: 'Tạo chat mới' })
    createChat(@Req() req: AuthenticatedRequest, @Body() body: CreateChatDto) {
        return this.chats.createChat(req.user, body?.title, body?.subjectId);
    }

    @Patch(':chatId')
    @ApiOperation({ summary: 'Cập nhật chat' })
    updateChat(@Req() req: AuthenticatedRequest, @Param('chatId') chatId: string, @Body() body: RenameChatDto) {
        return this.chats.updateChat(chatId, req.user, body.title);
    }

    @Delete(':chatId')
    @ApiOperation({ summary: 'Xóa chat (?deleteFiles=true xóa luôn các file đính kèm)' })
    deleteChat(@Req() req: AuthenticatedRequest, @Param('chatId') chatId: string, @Query() query: DeleteChatQueryDto) {
        if (query.deleteFiles === 'true') return this.deletion.clearChat(chatId, req.user, true, tokenOf(req));
        return this.deletion.deleteChat(chatId, req.user);
    }

    @Post(':chatId/clear')
    @ApiOperation({ summary: 'Xóa nội dung chat và tùy chọn xóa files' })
    clearChat(@Req() req: AuthenticatedRequest, @Param('chatId') chatId: string, @Body() body: ClearChatDto) {
        return this.deletion.clearChat(chatId, req.user, body.deleteFiles || false, tokenOf(req));
    }

    @Get(':chatId/exists')
    @ApiOperation({ summary: 'Kiểm tra chat tồn tại' })
    chatExists(@Param('chatId') chatId: string, @Req() req: AuthenticatedRequest) {
        return this.chats.chatExists(chatId, req.user);
    }

    // ==================== MESSAGES ====================

    @Get(':chatId/messages')
    @ApiOperation({ summary: 'Lấy messages của chat' })
    getChatMessages(@Req() req: AuthenticatedRequest, @Param('chatId') chatId: string) {
        return this.chats.getMessages(chatId, req.user);
    }

    @Post(':chatId/message')
    @ApiOperation({ summary: 'Gửi message đến chat' })
    sendMessage(@Req() req: AuthenticatedRequest, @Param('chatId') chatId: string, @Body() body: SendMessageDto) {
        return this.answers.sendMessage(chatId, req.user, body, tokenOf(req));
    }

    @Post(':chatId/stream')
    @ApiOperation({ summary: 'Gửi message với streaming response (SSE)' })
    async streamMessage(
        @Req() req: AuthenticatedRequest,
        @Res() res: Response,
        @Param('chatId') chatId: string,
        @Body() body: SendMessageDto
    ) {
        await this.streams.streamMessage(chatId, req.user, body, tokenOf(req), new SseResponse(res));
    }

    @Patch('message/:messageId')
    @ApiOperation({ summary: 'Cập nhật message' })
    updateMessage(@Req() req: AuthenticatedRequest, @Param('messageId') messageId: string, @Body() body: EditMessageDto) {
        return this.chats.updateMessage(messageId, req.user, body.content);
    }

    @Delete('message/:messageId')
    @ApiOperation({ summary: 'Xóa message' })
    deleteMessage(@Req() req: AuthenticatedRequest, @Param('messageId') messageId: string) {
        return this.deletion.deleteMessage(messageId, req.user);
    }

    @Post('message/:messageId/regenerate')
    @ApiOperation({ summary: 'Regenerate AI response từ message' })
    regenerateFromMessage(@Req() req: AuthenticatedRequest, @Param('messageId') messageId: string) {
        return this.answers.regenerateFromMessage(messageId, req.user, tokenOf(req));
    }

    @Post('message/:messageId/regenerate-stream')
    @ApiOperation({ summary: 'Regenerate AI response từ message với streaming (SSE)' })
    async regenerateFromMessageStream(
        @Req() req: AuthenticatedRequest,
        @Res() res: Response,
        @Param('messageId') messageId: string
    ) {
        await this.streams.regenerateStream(messageId, req.user, tokenOf(req), new SseResponse(res));
    }

    // ==================== DOCUMENTS ====================

    @Get(':chatId/documents')
    @ApiOperation({ summary: 'Lấy documents của chat' })
    getDocuments(@Req() req: AuthenticatedRequest, @Param('chatId') chatId: string) {
        return this.documents.list(chatId, req.user, tokenOf(req));
    }

    @Post(':chatId/documents')
    @ApiOperation({ summary: 'Thêm document vào chat' })
    addDocument(@Req() req: AuthenticatedRequest, @Param('chatId') chatId: string, @Body() body: AddDocumentDto) {
        return this.documents.add(chatId, req.user, body.documentId, body.documentName, tokenOf(req));
    }

    @Delete(':chatId/documents/:documentId')
    @ApiOperation({ summary: 'Xóa document khỏi chat' })
    removeDocument(@Req() req: AuthenticatedRequest, @Param('chatId') chatId: string, @Param('documentId') documentId: string) {
        return this.documents.remove(chatId, req.user, documentId);
    }
}
