import { Injectable } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import {
    AuthClient,
    ProfileLookupOptions,
    PublicUser,
} from '../../clients/auth.client';

type MaybeId = string | null | undefined;

/**
 * Post-query enrichment: exam rows only carry user ids (the relation lives in
 * auth). Every method collects the ids of the whole input, makes ONE profile
 * call and attaches the public projection; a user auth does not know (or an
 * unreachable auth) leaves `null` in place. Inputs are never mutated.
 */
@Injectable()
export class UserEnricher {
    constructor(private readonly auth: AuthClient) {}

    async profileMap(
        ids: MaybeId[],
        metadata?: Metadata,
        options?: ProfileLookupOptions
    ): Promise<Map<string, PublicUser>> {
        const unique = [...new Set(ids.filter((id): id is string => !!id))];
        const profiles = await this.auth.getPublicProfiles(unique, metadata, options);
        const out = new Map<string, PublicUser>();
        unique.forEach((id, i) => {
            const p = profiles[i];
            if (p) out.set(id, p);
        });
        return out;
    }

    async withUsers<T extends { userId: string }>(
        rows: T[]
    ): Promise<Array<T & { user: PublicUser | null }>> {
        if (rows.length === 0) return [];
        const map = await this.profileMap(rows.map((r) => r.userId));
        return rows.map((r) => ({ ...r, user: map.get(r.userId) ?? null }));
    }

    async withUser<T extends { userId: string }>(
        row: T
    ): Promise<T & { user: PublicUser | null }> {
        return (await this.withUsers([row]))[0];
    }

    async withHosts<T extends { hostId: string }>(
        rows: T[]
    ): Promise<Array<T & { host: PublicUser | null }>> {
        if (rows.length === 0) return [];
        const map = await this.profileMap(rows.map((r) => r.hostId));
        return rows.map((r) => ({ ...r, host: map.get(r.hostId) ?? null }));
    }

    async withHost<T extends { hostId: string }>(
        row: T
    ): Promise<T & { host: PublicUser | null }> {
        return (await this.withHosts([row]))[0];
    }

    /** `session.examRoom.host` from `session.examRoom.hostId`. */
    async withRoomHosts<T extends { examRoom: { hostId: string } }>(
        sessions: T[]
    ): Promise<Array<T & { examRoom: T['examRoom'] & { host: PublicUser | null } }>> {
        if (sessions.length === 0) return [];
        const map = await this.profileMap(sessions.map((s) => s.examRoom.hostId));
        return sessions.map((s) => ({
            ...s,
            examRoom: {
                ...s.examRoom,
                host: map.get(s.examRoom.hostId) ?? null,
            },
        }));
    }

    async withRoomHost<T extends { examRoom: { hostId: string } }>(
        session: T
    ): Promise<T & { examRoom: T['examRoom'] & { host: PublicUser | null } }> {
        return (await this.withRoomHosts([session]))[0];
    }
}
