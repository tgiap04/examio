import { Inject, Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { Prisma } from '../../prisma';
import { z } from 'zod';
import { wordFamilyAdminV1 } from '@examio/contracts';
import { WordFamilyRepository } from './word-family.repository';
import { r2KeyFromUrl } from '@examio/common';

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
 * queues the old object for deletion in the same transaction as the row change
 * (CLAUDE.md: a record's R2 file never outlives it; the worker does the delete).
 */
@Injectable()
export class WordFamilyAdminService {
    private readonly logger = new Logger(WordFamilyAdminService.name);

    constructor(
        private readonly repo: WordFamilyRepository,
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

        const updated = await this.repo.updateCategory(
            req.id,
            { isActive: false, imageUrl: null },
            this.imageKeysToDelete(existing.imageUrl, { strict: true })
        );
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
        // The old image is queued in the same tx as the row update.
        const oldImageKeys =
            input.imageUrl !== undefined && input.imageUrl !== existing.imageUrl
                ? this.imageKeysToDelete(existing.imageUrl, { strict: false })
                : [];
        const updated = await mapUniqueViolation(() =>
            this.repo.updateCategory(req.id, data, oldImageKeys)
        );
        return updated;
    }

    /** The R2 keys to queue for `imageUrl`: only word-family objects on our public host. */
    private imageKeysToDelete(imageUrl: string | null, opts: { strict: boolean }): string[] {
        if (!imageUrl) return [];
        if (!this.r2PublicBase) {
            if (opts.strict) {
                fail(
                    status.FAILED_PRECONDITION,
                    'R2_PUBLIC_URL is not configured; cannot tell whether the category image is an R2 object'
                );
            }
            this.logger.error('R2_PUBLIC_URL is not configured; old category image not deleted');
            return [];
        }
        const key = r2KeyFromUrl(imageUrl, this.r2PublicBase);
        if (!key) return []; // external image: not ours to delete
        if (!key.startsWith(WORD_FAMILY_IMAGE_PREFIX) || key.split('/').includes('..')) {
            // An R2 object of another feature (documents, avatars, ...): never ours to delete.
            this.logger.warn(`category image ${key} is outside ${WORD_FAMILY_IMAGE_PREFIX}; not deleted`);
            return [];
        }
        return [key];
    }
}
