import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';

/**
 * Public-safe field selection of a subject. It never includes `systemPrompt` (the proprietary LLM
 * prompt): these methods back an unauthenticated controller, and the prompt only ever leaves this
 * service inside a call to ai-service.
 */
const PUBLIC_SUBJECT_FIELDS = {
    id: true,
    categoryId: true,
    name: true,
    slug: true,
    description: true,
    icon: true,
    color: true,
    order: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
} as const;

/** The public fields plus the subject's category. */
const PUBLIC_SUBJECT_SELECT = {
    ...PUBLIC_SUBJECT_FIELDS,
    category: { select: { id: true, name: true, slug: true, icon: true, color: true } },
} as const;

@Injectable()
export class SubjectRepository {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Get all subject categories with their subjects
     */
    async getCategoriesWithSubjects() {
        return this.prisma.subjectCategory.findMany({
            where: { isActive: true },
            orderBy: { order: 'asc' },
            include: {
                subjects: {
                    where: { isActive: true },
                    orderBy: { order: 'asc' },
                    select: PUBLIC_SUBJECT_FIELDS,
                },
            },
        });
    }

    /** All active subjects (flat list), public fields only. */
    async getAllSubjects() {
        return this.prisma.subject.findMany({
            where: { isActive: true },
            orderBy: [{ category: { order: 'asc' } }, { order: 'asc' }],
            select: PUBLIC_SUBJECT_SELECT,
        });
    }

    /**
     * Get a subject by ID
     */
    async getSubjectById(id: string) {
        return this.prisma.subject.findUnique({
            where: { id },
            select: PUBLIC_SUBJECT_SELECT,
        });
    }

    /**
     * Get a subject by slug
     */
    async getSubjectBySlug(slug: string) {
        return this.prisma.subject.findUnique({
            where: { slug },
            select: PUBLIC_SUBJECT_SELECT,
        });
    }
}
