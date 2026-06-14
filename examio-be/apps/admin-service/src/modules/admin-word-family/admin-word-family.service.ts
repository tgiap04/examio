import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@examio/database';

import { AuditWriterService } from '../../common/audit-writer.service';
import { CreateCategoryBody } from './dto/create-category.body';
import { UpdateCategoryBody } from './dto/update-category.body';

export interface AuditContext {
    adminId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
}

@Injectable()
export class AdminWordFamilyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditWriter: AuditWriterService,
    ) {}

    /** List all categories (admin view includes inactive). */
    async listCategories() {
        return this.prisma.wordFamilyCategory.findMany({
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
        });
    }

    /** Create a new word family category. */
    async createCategory(body: CreateCategoryBody, ctx: AuditContext) {
        // Check slug uniqueness
        const existing = await this.prisma.wordFamilyCategory.findUnique({
            where: { slug: body.slug },
        });
        if (existing) {
            throw new ConflictException(
                `Category with slug "${body.slug}" already exists.`,
            );
        }

        return this.prisma.$transaction(
            async (tx) => {
                const category = await tx.wordFamilyCategory.create({
                    data: {
                        name: body.name,
                        slug: body.slug,
                        description: body.description ?? null,
                        imageUrl: body.imageUrl ?? null,
                        order: body.order ?? 0,
                    },
                });

                await this.auditWriter.write(
                    {
                        adminId: ctx.adminId,
                        action: 'admin.wordFamily.category.create',
                        targetId: category.id,
                        payload: {
                            name: category.name,
                            slug: category.slug,
                        },
                        ipAddress: ctx.ipAddress,
                        userAgent: ctx.userAgent,
                    },
                    { tx },
                );

                return category;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    }

    /** Update an existing word family category. */
    async updateCategory(id: string, body: UpdateCategoryBody, ctx: AuditContext) {
        return this.prisma.$transaction(
            async (tx) => {
                const existing = await tx.wordFamilyCategory.findUnique({
                    where: { id },
                });
                if (!existing) {
                    throw new NotFoundException('Category not found');
                }

                const data: Prisma.WordFamilyCategoryUpdateInput = {};
                const changedFields: string[] = [];

                if (body.name !== undefined && body.name !== existing.name) {
                    data.name = body.name;
                    changedFields.push('name');
                }
                if (body.description !== undefined && body.description !== existing.description) {
                    data.description = body.description;
                    changedFields.push('description');
                }
                if (body.imageUrl !== undefined && body.imageUrl !== existing.imageUrl) {
                    data.imageUrl = body.imageUrl;
                    changedFields.push('imageUrl');
                }
                if (body.order !== undefined && body.order !== existing.order) {
                    data.order = body.order;
                    changedFields.push('order');
                }
                if (body.isActive !== undefined && body.isActive !== existing.isActive) {
                    data.isActive = body.isActive;
                    changedFields.push('isActive');
                }

                if (changedFields.length === 0) {
                    return existing;
                }

                const updated = await tx.wordFamilyCategory.update({
                    where: { id },
                    data,
                });

                // Batch audit writes — one DB round-trip for all changed fields
                if (changedFields.length > 0) {
                    const auditRows = changedFields.map((field) => ({
                        adminId: ctx.adminId,
                        action: 'admin.wordFamily.category.update',
                        targetId: id,
                        payload: JSON.stringify({
                            field,
                            from: (existing as Record<string, unknown>)[field],
                            to: (updated as Record<string, unknown>)[field],
                        }),
                        ipAddress: ctx.ipAddress,
                        userAgent: ctx.userAgent,
                    }));

                    const client: any = tx;
                    await client.adminAudit.createMany({ data: auditRows });
                }

                return updated;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    }

    /** Soft-delete a category by setting isActive = false. */
    async deleteCategory(id: string, ctx: AuditContext) {
        return this.prisma.$transaction(
            async (tx) => {
                const existing = await tx.wordFamilyCategory.findUnique({
                    where: { id },
                });
                if (!existing) {
                    throw new NotFoundException('Category not found');
                }

                const updated = await tx.wordFamilyCategory.update({
                    where: { id },
                    data: { isActive: false },
                });

                await this.auditWriter.write(
                    {
                        adminId: ctx.adminId,
                        action: 'admin.wordFamily.category.delete',
                        targetId: id,
                        payload: {
                            name: existing.name,
                            slug: existing.slug,
                            previousIsActive: existing.isActive,
                        },
                        ipAddress: ctx.ipAddress,
                        userAgent: ctx.userAgent,
                    },
                    { tx },
                );

                return { message: 'Category deleted', category: updated };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    }
}
