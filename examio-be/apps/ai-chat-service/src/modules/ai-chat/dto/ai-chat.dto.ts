import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { MESSAGE_MAX_CHARS } from '../../../config/ai-chat.constants';

/** Ids that come from clients (documents, subjects): bounded so nothing absurd reaches a query or an RPC. */
const id = z.string().min(1).max(128);
const optionalId = id.optional();

export const CreateChatSchema = z.object({
    title: z.string().max(255).optional(),
    subjectId: optionalId,
});
export class CreateChatDto extends createZodDto(CreateChatSchema) {}

export const RenameChatSchema = z.object({ title: z.string().max(255) });
export class RenameChatDto extends createZodDto(RenameChatSchema) {}

export const ClearChatSchema = z.object({
    deleteFiles: z.boolean().optional(),
});
export class ClearChatDto extends createZodDto(ClearChatSchema) {}

/** `DELETE :chatId?deleteFiles=true` also deletes the chat's documents. */
export const DeleteChatQuerySchema = z.object({
    deleteFiles: z.enum(['true', 'false']).optional(),
});
export class DeleteChatQueryDto extends createZodDto(DeleteChatQuerySchema) {}

export const SendMessageSchema = z.object({
    message: z.string().max(MESSAGE_MAX_CHARS),
    imageUrl: z.string().max(2048).optional(),
    documentId: optionalId,
    documentIds: z.array(id).max(50).optional(),
    documentName: z.string().max(512).optional(),
    modelType: z.string().max(128).optional(),
});
export class SendMessageDto extends createZodDto(SendMessageSchema) {}

/** Any message can be edited, assistant answers included, so the cap is far above the 8000 of a question. */
export const EditMessageSchema = z.object({ content: z.string().max(100_000) });
export class EditMessageDto extends createZodDto(EditMessageSchema) {}

export const AddDocumentSchema = z.object({
    documentId: id,
    documentName: z.string().max(512),
});
export class AddDocumentDto extends createZodDto(AddDocumentSchema) {}
