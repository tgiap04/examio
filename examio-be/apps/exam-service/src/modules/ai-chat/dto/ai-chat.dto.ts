import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const optionalText = z.string().optional();

export const CreateChatSchema = z.object({
    title: optionalText,
    subjectId: optionalText,
});
export class CreateChatDto extends createZodDto(CreateChatSchema) {}

export const RenameChatSchema = z.object({ title: z.string() });
export class RenameChatDto extends createZodDto(RenameChatSchema) {}

export const ClearChatSchema = z.object({
    deleteFiles: z.boolean().optional(),
});
export class ClearChatDto extends createZodDto(ClearChatSchema) {}

export const SendMessageSchema = z.object({
    message: z.string(),
    imageUrl: optionalText,
    documentId: optionalText,
    documentIds: z.array(z.string()).optional(),
    documentName: optionalText,
    modelType: optionalText,
});
export class SendMessageDto extends createZodDto(SendMessageSchema) {}

export const EditMessageSchema = z.object({ content: z.string() });
export class EditMessageDto extends createZodDto(EditMessageSchema) {}

export const AddDocumentSchema = z.object({
    documentId: z.string().min(1),
    documentName: z.string(),
});
export class AddDocumentDto extends createZodDto(AddDocumentSchema) {}
