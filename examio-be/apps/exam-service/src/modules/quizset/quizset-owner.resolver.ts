import { Injectable } from '@nestjs/common';
import type { OwnerResolver, OwnerResolverRequest } from '@examio/auth-jwt';
import { PrismaService } from '@examio/database';

/**
 * Owner of the quiz set a request names: `:id`, `:quizSetId` or `body.quizSetId`
 * (single narrow `findUnique`). Only the owner relation is read, never the
 * owner's account.
 */
@Injectable()
export class QuizSetOwnerResolver implements OwnerResolver {
    constructor(private readonly prisma: PrismaService) {}

    async resolveOwnerId(req: OwnerResolverRequest): Promise<string | null> {
        const body = req.body as { quizSetId?: unknown } | undefined;
        const fromBody =
            typeof body?.quizSetId === 'string' ? body.quizSetId : undefined;
        const id = req.params?.id ?? req.params?.quizSetId ?? fromBody;
        if (!id) return null;
        const row = await this.prisma.quizSet.findUnique({
            where: { id },
            select: { userId: true },
        });
        return row?.userId ?? null;
    }
}
