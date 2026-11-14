import { Injectable } from '@nestjs/common';
import { PublicUser, UserEnricher as BaseUserEnricher } from '@kmaedu/grpc';
import { AuthClient } from '../../clients/auth.client';

/**
 * Generic user/host enrichment lives in `@kmaedu/grpc` (shared with
 * study-room); assessment adds only the `session.examRoom.host` shape.
 */
@Injectable()
export class UserEnricher extends BaseUserEnricher {
    constructor(auth: AuthClient) {
        super(auth);
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
