import { BadRequestException, Logger } from '@nestjs/common';
import { isForeignR2Url, ownedR2KeyFromUrl } from '@examio/common';

const logger = new Logger('OwnedThumbnail');

/**
 * Thumbnail objects live at `<area>/<ownerUserId>/<random>-<name>` (server-issued).
 * A client-supplied thumbnail URL may be external, the row's current value, or one
 * of the caller's own uploads - never another user's (or an owner-less legacy) R2
 * object, which deleting the row would otherwise queue for deletion.
 */
export function assertThumbnailAllowed(
    url: string | null | undefined,
    area: string,
    ownerId: string,
    current?: string | null
): void {
    if (!url || url === current) return;
    if (isForeignR2Url(url, [area], ownerId)) {
        throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            message: 'Thumbnail không hợp lệ',
        });
    }
}

/**
 * The key to delete for a thumbnail that is no longer used by its row: only when
 * it is under the owner's prefix AND no other row of the owner still references
 * the URL (`countReferences`, an indexed `userId` lookup). Everything else - external
 * URLs, legacy owner-less keys, shared objects - is left alone (logged at info).
 */
export async function thumbnailKeyToDelete(
    url: string | null | undefined,
    area: string,
    ownerId: string,
    countReferences: (url: string) => Promise<number>
): Promise<string | null> {
    if (!url) return null;
    const key = ownedR2KeyFromUrl(url, [area], ownerId);
    if (!key) {
        logger.log(`Not deleting thumbnail outside ${area}/${ownerId}/`);
        return null;
    }
    if ((await countReferences(url)) > 0) {
        logger.log(`Keeping thumbnail ${key}: still referenced`);
        return null;
    }
    return key;
}
