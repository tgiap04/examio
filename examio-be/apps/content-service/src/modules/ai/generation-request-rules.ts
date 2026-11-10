import { BadRequestException } from '@nestjs/common';
import { documentV1 } from '@examio/contracts';
import { processingStatusName } from './document-mapper';
import {
    BYTES_PER_UPLOAD_CREDIT,
    GENERATE_CREDITS,
    GenerationType,
    ITEMS_PER_REGENERATE_CREDIT,
} from './generation.constants';
import { MAX_GENERATE_ITEMS } from './dto/ai.dto';

// Pure rules of a generation request: its type, its item count and its price.

/** Items generated when the request names no usable quantity. */
export const DEFAULT_GENERATE_ITEMS = 10;

/** `ceil(sizeMB / 2)` credits for storing + OCR-ing a new file. */
export const uploadCredits = (sizeBytes: number): number => Math.ceil(sizeBytes / BYTES_PER_UPLOAD_CREDIT);

/** 1 credit per started 10 items generated again from an uploaded document. */
export const regenerateCredits = (numItems: number): number => Math.ceil(numItems / ITEMS_PER_REGENERATE_CREDIT);

/** `typeResult` 2 is a flashcard set; anything else is a quiz. */
export const generationTypeOf = (typeResult?: number | string): GenerationType =>
    Number(typeResult) === 2 ? 'flashcard' : 'quiz';

/** A FAILED or PENDING document gets its OCR re-queued before the generation. */
export function needsReprocessing(doc: Pick<documentV1.DocumentInfo, 'processingStatus'>): boolean {
    const status = processingStatusName(doc);
    return status === 'FAILED' || status === 'PENDING';
}

/** What a generation costs, and whether the document must be (re)processed first. */
export interface ChargePlan {
    amount: number;
    ensureProcessed: boolean;
}

/**
 * New file: upload + generation in ONE debit. A reused document always pays the generation: COMPLETED
 * and PROCESSING (its OCR is awaited inside ai-service) as they are, FAILED / PENDING after re-queueing
 * its OCR. There is no free retry: a charged job that fails or is cancelled is refunded, so a free
 * retry on top would let a successful generation cost nothing.
 */
export function chargePlan(doc: Pick<documentV1.DocumentInfo, 'size' | 'processingStatus'>, reused: boolean): ChargePlan {
    if (!reused) return { amount: uploadCredits(Number(doc.size)) + GENERATE_CREDITS, ensureProcessed: false };
    return { amount: GENERATE_CREDITS, ensureProcessed: needsReprocessing(doc) };
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
