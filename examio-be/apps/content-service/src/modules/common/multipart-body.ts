import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Body of the create/update routes that accept an optional thumbnail upload.
 * The FE sends multipart text fields when a file is attached (booleans as
 * "true"/"false", `tags` as a JSON string) and plain JSON otherwise; both go
 * through the same schema so a bad value is a 400, never a silent default.
 */
const bool = z.preprocess(
    (v) => (v === 'true' ? true : v === 'false' ? false : v),
    z.boolean()
);

const tags = z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    try {
        return JSON.parse(v);
    } catch {
        return v; // left as a string so the array check rejects it
    }
}, z.array(z.string()));

export const setFormFields = {
    title: z.string().min(1, 'title must not be empty'),
    description: z.string().optional(),
    isPublic: bool,
    isPinned: bool,
    tags,
    thumbnail: z.string().url().optional(),
};

export const createSetFormSchema = z.object({
    ...setFormFields,
    isPublic: setFormFields.isPublic.default(false),
    isPinned: setFormFields.isPinned.default(false),
    tags: setFormFields.tags.default([]),
    thumbnail: setFormFields.thumbnail,
    description: setFormFields.description,
});

/** Update: every field optional; a field that is not sent is left untouched. */
export const updateSetFormSchema = z.object({
    title: setFormFields.title.optional(),
    description: setFormFields.description,
    isPublic: setFormFields.isPublic.optional(),
    isPinned: setFormFields.isPinned.optional(),
    tags: setFormFields.tags.optional(),
    thumbnail: setFormFields.thumbnail,
});

/** Empty-string text fields (a cleared form input) count as "not sent". */
function withoutEmptyOptionals(body: unknown): unknown {
    if (!body || typeof body !== 'object') return {};
    return Object.fromEntries(
        Object.entries(body).filter(([k, v]) => !(v === '' && k !== 'title'))
    );
}

export function parseSetForm<S extends z.ZodTypeAny>(
    schema: S,
    body: unknown
): z.infer<S> {
    const result = schema.safeParse(withoutEmptyOptionals(body));
    if (!result.success) {
        throw new BadRequestException({
            statusCode: 400,
            code: 'VALIDATION_FAILED',
            message: result.error.issues.map(
                (i) => `${i.path.join('.') || 'body'}: ${i.message}`
            ),
        });
    }
    return result.data;
}
