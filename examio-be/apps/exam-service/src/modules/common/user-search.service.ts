import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { Metadata } from '@grpc/grpc-js';
import { AuthClient } from '../../clients/auth.client';

export const USER_SEARCH_MIN_LENGTH = 3;
export const USER_SEARCH_LIMIT = 10;
/** Auth caps a search at 20; one extra slot absorbs dropping the caller. */
const AUTH_SEARCH_LIMIT = 20;

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
 * sessions). The matching rules (prefix on username/name, EXACT email, never
 * the email back) live in auth's `SearchUsers`; this only forwards the
 * caller's own token, drops the caller and caps the list.
 */
@Injectable()
export class UserSearchService {
    constructor(private readonly auth: AuthClient) {}

    async search(
        query: string,
        currentUserId: string,
        metadata: Metadata
    ): Promise<UserSearchResult[]> {
        const q = query.trim();
        if (q.length < USER_SEARCH_MIN_LENGTH) return [];
        const found = await this.auth.searchUsers(q, AUTH_SEARCH_LIMIT, metadata);
        return found
            .filter((p) => p.id !== currentUserId)
            .slice(0, USER_SEARCH_LIMIT)
            .map(({ id, username, name, avatar }) => ({ id, username, name, avatar }));
    }
}
