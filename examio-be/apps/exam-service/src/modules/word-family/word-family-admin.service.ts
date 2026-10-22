import { Inject, Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { buildMetadata } from '@examio/grpc';
import { wordFamilyAdminV1 } from '@examio/contracts';
import { R2Client } from '../../clients/r2.client';
import { WordFamilyRepository } from './word-family.repository';
import { r2KeyFromUrl } from './r2-key-from-url';

export const R2_PUBLIC_BASE_URL = 'R2_PUBLIC_BASE_URL';

/** The only R2 area category images live in; the admin-set `imageUrl` can name any public object. */
export const WORD_FAMILY_IMAGE_PREFIX = 'word-family/';

/** A unique-constraint race/violation (name or slug) is a client conflict, not an internal error. */
const mapUniqueViolation = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
        return await run();
    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            const target = err.meta?.target;
            const field = String(target ?? '').includes('slug') ? 'slug' : 'name';
            return fail(status.ALREADY_EXISTS, `Category with this ${field} already exists`);
        }
        throw err;
    }
};

type Category = Awaited<ReturnType<WordFamilyRepository['findCategoryById']>> & {};

const fail = (code: status, message: string): never => {
    throw new RpcException({ code, message });
};

const slug = z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits and dashes');
const fields = {
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    imageUrl: z.string().url().optional(),
    order: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
};
const createSchema = z.object({ ...fields, slug });
const updateSchema = z.object({
    ...fields,
    name: fields.name.optional(),
    slug: z.string().optional(),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
    const res = schema.safeParse(input);
    if (!res.success) {
        return fail(
            status.INVALID_ARGUMENT,
            res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        );
    }
    return res.data;
}

function toProto(c: NonNullable<Category>): wordFamilyAdminV1.WordFamilyCategory {
    return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description ?? '',
        imageUrl: c.imageUrl ?? '',
        order: c.order,
        isActive: c.isActive,
        createdAt: String(c.createdAt.getTime()),
        updatedAt: String(c.updatedAt.getTime()),
    };
}

/**
 * The single writer of `WordFamilyCategory` (admin-service used to write it
 * directly). Image objects live in R2: replacing or deleting a category image
 * deletes the old object (CLAUDE.md: a record's R2 file never outlives it).
 */
@Injectable()
export class WordFamilyAdminService {
    private readonly logger = new Logger(WordFamilyAdminService.name);

    constructor(
        private readonly repo: WordFamilyRepository,
        private readonly r2: R2Client,
        @Inject(R2_PUBLIC_BASE_URL) private readonly r2PublicBase: string
    ) {}

    async listCategories(
        req: Pick<wordFamilyAdminV1.ListCategoriesRequest, 'includeInactive'>
    ): Promise<wordFamilyAdminV1.ListCategoriesResponse> {
        const rows = await this.repo.listCategories(!!req.includeInactive);
        return { categories: rows.map(toProto) };
    }

    async upsertCategory(
        req: wordFamilyAdminV1.UpsertCategoryRequest
    ): Promise<wordFamilyAdminV1.UpsertCategoryResponse> {
        const category = req.id ? await this.update(req) : await this.create(req);
        return { category: toProto(category) };
    }

    async deleteCategory(
        req: wordFamilyAdminV1.DeleteCategoryRequest
    ): Promise<wordFamilyAdminV1.DeleteCategoryResponse> {
        const existing = await this.repo.findCategoryById(req.id);
        if (!existing) return fail(status.NOT_FOUND, 'Category not found');

        // R2 first: DeleteObjects is idempotent, so a failure here aborts with
        // the row untouched and the admin can simply retry.
        await this.deleteImage(existing.imageUrl, { strict: true });
        const updated = await this.repo.updateCategory(req.id, {
            isActive: false,
            imageUrl: null,
        });
        return { category: toProto(updated) };
    }

    private async create(req: wordFamilyAdminV1.UpsertCategoryRequest) {
        const input = parse(createSchema, {
            name: req.name,
            slug: req.slug,
            description: req.description,
            imageUrl: req.imageUrl || undefined,
            order: req.order,
        });
        if (await this.repo.findCategoryBySlug(input.slug)) {
            return fail(status.ALREADY_EXISTS, `Category with slug "${input.slug}" already exists`);
        }
        return mapUniqueViolation(() =>
            this.repo.createCategory({
                name: input.name,
                slug: input.slug,
                description: input.description,
                imageUrl: input.imageUrl,
                order: input.order,
            })
        );
    }

    private async update(req: wordFamilyAdminV1.UpsertCategoryRequest) {
        const input = parse(updateSchema, {
            name: req.name || undefined,
            slug: req.slug || undefined,
            description: req.description,
            imageUrl: req.imageUrl || undefined,
            order: req.order,
            isActive: req.isActive,
        });
        const existing = await this.repo.findCategoryById(req.id);
        if (!existing) return fail(status.NOT_FOUND, 'Category not found');
        if (input.slug !== undefined && input.slug !== existing.slug) {
            return fail(status.INVALID_ARGUMENT, 'slug is immutable (word families reference it)');
        }

        const data = {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
            ...(input.order !== undefined && { order: input.order }),
            ...(input.isActive !== undefined && { isActive: input.isActive }),
        };
        const updated = await mapUniqueViolation(() => this.repo.updateCategory(req.id, data));

        if (input.imageUrl !== undefined && input.imageUrl !== existing.imageUrl) {
            // The row already points at the new image; a failed cleanup only
            // leaves an orphan object, so it is logged, not surfaced.
            await this.deleteImage(existing.imageUrl, { strict: false });
        }
        return updated;
    }

    private async deleteImage(
        imageUrl: string | null,
        opts: { strict: boolean }
    ): Promise<void> {
        if (!imageUrl) return;
        if (!this.r2PublicBase) {
            if (opts.strict) {
                fail(
                    status.FAILED_PRECONDITION,
                    'R2_PUBLIC_URL is not configured; cannot tell whether the category image is an R2 object'
                );
            }
            this.logger.error('R2_PUBLIC_URL is not configured; old category image not deleted');
            return;
        }
        const key = r2KeyFromUrl(imageUrl, this.r2PublicBase);
        if (!key) return; // external image: not ours to delete
        if (!key.startsWith(WORD_FAMILY_IMAGE_PREFIX) || key.split('/').includes('..')) {
            // An R2 object of another feature (documents, avatars, ...): never ours to delete.
            this.logger.warn(`category image ${key} is outside ${WORD_FAMILY_IMAGE_PREFIX}; not deleted`);
            return;
        }
        try {
            await this.r2.deleteFile(key, buildMetadata());
        } catch (err) {
            if (opts.strict) throw err;
            this.logger.error(
                `Failed to delete old category image ${key}: ${(err as Error).message}`
            );
        }
    }
}
