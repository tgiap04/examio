/**
 * R2 areas of server-issued AI uploads; every key is `<area>/<ownerUserId>/<random>-<name>`
 * (`ai-uploads`: generate-from-file, `ai-teacher`: quick upload).
 */
export const AI_UPLOAD_AREAS = ['ai-uploads', 'ai-teacher'] as const;
