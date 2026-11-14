import { Injectable } from '@nestjs/common';
import type { OwnerResolver, OwnerResolverRequest } from '@kmaedu/auth-jwt';
import { PrismaService } from '../../prisma';

/** Owner of the flashcard set named by `:id` or `:flashCardSetId` (single narrow `findUnique`). */
@Injectable()
export class FlashcardSetOwnerResolver implements OwnerResolver {
    constructor(private readonly prisma: PrismaService) {}

    async resolveOwnerId(req: OwnerResolverRequest): Promise<string | null> {
        const id = req.params?.id ?? req.params?.flashCardSetId;
        if (!id) return null;
        const row = await this.prisma.flashCardSet.findUnique({
            where: { id },
            select: { userId: true },
        });
        return row?.userId ?? null;
    }
}
