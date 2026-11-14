import { authV1 } from '@kmaedu/contracts';

/** Public projection of a user: the only thing a consumer ever holds about one. */
export interface PublicUser {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
}

/** Explicit pick: nothing outside the public projection is ever cached or returned. */
export function toPublicUser(p: authV1.PublicProfile): PublicUser {
    return {
        id: p.id,
        username: p.username,
        name: p.name || null,
        avatar: p.avatar || null,
    };
}
