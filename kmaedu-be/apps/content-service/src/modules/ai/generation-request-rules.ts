import { BadRequestException } from '@nestjs/common';
import { documentV1 } from '@kmaedu/contracts';
import { processingStatusName } from './document-mapper';
import { GenerationType } from './generation.constants';
import { MAX_GENERATE_ITEMS } from './dto/ai.dto';

// Pure rules of a generation request: its type and its item count.

/** Items generated when the request names no usable quantity. */
export const DEFAULT_GENERATE_ITEMS = 10;

/** `typeResult` 2 is a flashcard set; anything else is a quiz. */
export const generationTypeOf = (typeResult?: number | string): GenerationType =>
    Number(typeResult) === 2 ? 'flashcard' : 'quiz';

/**
 * A reused FAILED or PENDING (quick-upload) document gets its OCR re-queued before the generation;
 * COMPLETED and PROCESSING documents (the OCR is awaited inside ai-service) are used as they are.
 */
export function needsReprocessing(doc: Pick<documentV1.DocumentInfo, 'processingStatus'>): boolean {
    const status = processingStatusName(doc);
    return status === 'FAILED' || status === 'PENDING';
}

/** Form-data quantity: default 10, anything over MAX_GENERATE_ITEMS is refused. */
export function parseGenerateQuantity(raw: string | undefined, label: string): number {
    if (!raw) return DEFAULT_GENERATE_ITEMS;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_GENERATE_ITEMS;
    if (parsed > MAX_GENERATE_ITEMS) {
        throw new BadRequestException(`Số ${label} tối đa là ${MAX_GENERATE_ITEMS}, bạn đã yêu cầu ${parsed}`);
    }
    return parsed;
}
