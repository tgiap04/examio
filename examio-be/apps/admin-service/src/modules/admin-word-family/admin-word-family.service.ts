import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import type { wordFamilyAdminV1 } from '@examio/contracts';

import { VocabularyClient } from '../../clients/vocabulary.client';
import { AuditWriterService } from '../../common/audit-writer.service';
import { writeAuditBestEffort } from '../admin-roles/best-effort-audit';
import { CreateCategoryBody } from './dto/create-category.body';
import { UpdateCategoryBody } from './dto/update-category.body';

export interface AuditContext {
    adminId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
}

export interface CategoryRow {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    order: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const UPDATABLE = ['name', 'description', 'imageUrl', 'order', 'isActive'] as const;

/** Wire message -> the row shape the admin API has always returned. */
function toRow(c: wordFamilyAdminV1.WordFamilyCategory): CategoryRow {
    return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description || null,
        imageUrl: c.imageUrl || null,
        order: c.order,
        isActive: c.isActive,
        createdAt: new Date(Number(c.createdAt)),
        updatedAt: new Date(Number(c.updatedAt)),
    };
}

/**
 * Word-family category administration through `WordFamilyAdminService` (served
 * by vocabulary-service) with the calling admin's
 * token. The owner writes the data (and deletes the R2 image); admin records
 * AdminAudit rows once the RPC committed (best effort, like the other admin
 * modules).
 */
@Injectable()
export class AdminWordFamilyService {
    private readonly logger = new Logger(AdminWordFamilyService.name);

    constructor(
        private readonly auditWriter: AuditWriterService,
        private readonly vocabulary: VocabularyClient
    ) {}

    /** List all categories (admin view includes inactive). */
    async listCategories(metadata: Metadata): Promise<CategoryRow[]> {
        const { categories } = await this.vocabulary.listCategories({ includeInactive: true }, metadata);
        return categories.map(toRow);
    }

    /** Create a category; a duplicate slug is the owner's 409. */
    async createCategory(body: CreateCategoryBody, ctx: AuditContext, metadata: Metadata) {
        const { category } = await this.vocabulary.upsertCategory(
            {
                id: '',
                name: body.name,
                slug: body.slug,
                description: body.description,
                imageUrl: body.imageUrl,
                order: body.order,
            },
            metadata
        );
        const created = toRow(category!);
        await this.audit(ctx, 'admin.wordFamily.category.create', created.id, {
            name: created.name,
            slug: created.slug,
        });
        return created;
    }

    /** Update the changed fields of a category (slug never changes). */
    async updateCategory(
        id: string,
        body: UpdateCategoryBody,
        ctx: AuditContext,
        metadata: Metadata
    ): Promise<CategoryRow> {
        const existing = (await this.listCategories(metadata)).find((c) => c.id === id);
        if (!existing) throw new NotFoundException('Category not found');

        const changed = UPDATABLE.filter(
            (field) => body[field] !== undefined && body[field] !== existing[field]
        );
        if (changed.length === 0) return existing;

        const { category } = await this.vocabulary.upsertCategory(
            {
                id,
                name: body.name ?? existing.name,
                slug: existing.slug,
                description: body.description,
                imageUrl: body.imageUrl,
                order: body.order,
                isActive: body.isActive,
            },
            metadata
        );
        const updated = toRow(category!);
        for (const field of changed) {
            await this.audit(ctx, 'admin.wordFamily.category.update', id, {
                field,
                from: existing[field],
                to: updated[field],
            });
        }
        return updated;
    }

    /** Deactivate a category; the owner also deletes its image object from R2. */
    async deleteCategory(id: string, ctx: AuditContext, metadata: Metadata) {
        const existing = (await this.listCategories(metadata)).find((c) => c.id === id);
        const { category } = await this.vocabulary.deleteCategory({ id }, metadata);
        await this.audit(ctx, 'admin.wordFamily.category.delete', id, {
            name: existing?.name,
            slug: existing?.slug,
            previousIsActive: existing?.isActive,
        });
        return { message: 'Category deleted', category: toRow(category!) };
    }

    private audit(ctx: AuditContext, action: string, targetId: string, payload: Record<string, unknown>) {
        return writeAuditBestEffort(this.auditWriter, this.logger, {
            adminId: ctx.adminId,
            action,
            targetId,
            payload,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
        });
    }
}
