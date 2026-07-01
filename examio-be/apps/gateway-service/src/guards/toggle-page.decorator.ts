import { SetMetadata } from '@nestjs/common';

/** Metadata key giữ pageKey cho PageEnabledGuard. */
export const PAGE_KEY_METADATA = 'pageKey';

/**
 * Gắn một pageKey (thuộc TOGGLEABLE_PAGE_KEYS) lên controller/handler để
 * `PageEnabledGuard` biết trang nào cần kiểm tra bật/tắt.
 *
 * @example
 * ⁠@UseGuards(PageEnabledGuard)
 * ⁠@TogglePage('word-family')
 * export class WordFamilyProxyController {}
 */
export const TogglePage = (key: string) => SetMetadata(PAGE_KEY_METADATA, key);
