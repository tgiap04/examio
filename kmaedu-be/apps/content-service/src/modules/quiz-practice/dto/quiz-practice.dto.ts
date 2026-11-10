import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';

const id = z.string().min(1).max(64);
const MAX_QUESTIONS = 1000;

export class StartAttemptDto extends createZodDto(
    z.object({ quizSetId: id })
) {
    @ApiProperty({ description: 'Quiz set to practise' })
    quizSetId: string;
}

export class UnlockQuizSetDto extends createZodDto(
    z.object({ code: z.string().min(1).max(32) })
) {
    @ApiProperty({ example: '482913' })
    code: string;
}

const SaveAttemptSchema = z.object({
    answers: z
        .record(z.string().max(64), z.string().max(2000))
        .refine((a) => Object.keys(a).length <= MAX_QUESTIONS, {
            message: `at most ${MAX_QUESTIONS} answers`,
        }),
    currentIndex: z.number().int().min(0).max(100_000),
    markedQuestions: z.array(id).max(MAX_QUESTIONS),
    timeSpentSeconds: z.number().int().min(0).max(10_000_000),
});

export class SaveAttemptDto extends createZodDto(SaveAttemptSchema) {
    @ApiProperty({ description: '{ questionId: selected option letter (A, B, ...) or option text }' })
    answers: Record<string, string>;
    @ApiProperty() currentIndex: number;
    @ApiProperty({ type: [String] }) markedQuestions: string[];
    @ApiProperty() timeSpentSeconds: number;
}

const PageSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
});

export class ListSetsQueryDto extends createZodDto(PageSchema) {
    @ApiProperty({ required: false }) page: number;
    @ApiProperty({ required: false }) limit: number;
}

export class ListAttemptsQueryDto extends createZodDto(
    PageSchema.extend({ quizSetId: id.optional() })
) {
    @ApiProperty({ required: false }) quizSetId?: string;
    @ApiProperty({ required: false }) page: number;
    @ApiProperty({ required: false }) limit: number;
}
