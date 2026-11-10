import { DocumentErrorCode, documentError } from './document-errors';

/** The non-blank ids of a batch call without repeats; 400 when more than `max` remain. */
export function distinctIds(ids: string[], max: number): string[] {
    const distinct = [...new Set(ids.filter((id) => id.trim().length > 0))];
    if (distinct.length > max) {
        throw documentError(400, DocumentErrorCode.VALIDATION_FAILED, `At most ${max} ids per call`);
    }
    return distinct;
}
