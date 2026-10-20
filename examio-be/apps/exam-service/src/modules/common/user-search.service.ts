import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { PrismaService } from '@examio/database';

export const USER_SEARCH_MIN_LENGTH = 3;
export const USER_SEARCH_LIMIT = 10;

export interface UserSearchResult {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
}

/** `?q=` must be a string of at least 3 characters (trimmed). Anything else is a 400. */
@Injectable()
export class SearchQueryPipe implements PipeTransform<unknown, string> {
    transform(value: unknown): string {
        const q = typeof value === 'string' ? value.trim() : '';
        if (q.length < USER_SEARCH_MIN_LENGTH) {
            throw new BadRequestException({
                statusCode: 400,
                code: 'QUERY_TOO_SHORT',
                message: `q must be at least ${USER_SEARCH_MIN_LENGTH} characters`,
            });
        }
        return q;
    }
}

/**
 * Whitelist picker for a teacher sharing content (flashcard sets and exam
 * sessions). Matches `username` / `name` by PREFIX, or `email` by EXACT value,
 * and never returns the email, so it can not be used to enumerate accounts.
 */
@Injectable()
export class UserSearchService {
    constructor(private readonly prisma: PrismaService) {}

    async search(
        query: string,
        currentUserId: string
    ): Promise<UserSearchResult[]> {
        const q = query.trim();
        if (q.length < USER_SEARCH_MIN_LENGTH) return [];
        return this.prisma.user.findMany({
            where: {
                id: { not: currentUserId },
                deletedAt: null,
                OR: [
                    { username: { startsWith: q, mode: 'insensitive' } },
                    { name: { startsWith: q, mode: 'insensitive' } },
                    { email: { equals: q, mode: 'insensitive' } },
                ],
            },
            select: { id: true, username: true, name: true, avatar: true },
            orderBy: { username: 'asc' },
            take: USER_SEARCH_LIMIT,
        });
    }
}
