import { Injectable, Logger } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { ContentClient } from '../../clients/content.client';
import { EXAM_SESSION_STATUS } from '../../types';

export interface DriftSession {
    status: number;
    quizSnapshotHash: string;
    /** Attempts of the session, counted right now (not read from a cached row). */
    attemptCount: number;
}

/** The room fields the drift check reads. */
export interface DriftRoom {
    quizSetId: string;
    sourceDeleted: boolean;
}

export interface SessionDrift {
    /** The source set no longer matches the snapshot; `null` when content-service could not answer. */
    snapshotOutdated: boolean | null;
    /** A refresh would be accepted right now (the server re-checks it under the row lock). */
    canRefreshSnapshot: boolean;
}

/** The only states in which re-taking the snapshot is safe: not started and nobody has attempted it. */
export function canRefresh(session: Pick<DriftSession, 'status' | 'attemptCount'>, sourceDeleted: boolean): boolean {
    return session.status === EXAM_SESSION_STATUS.UPCOMING && session.attemptCount === 0 && !sourceDeleted;
}

/**
 * Host-view drift: is the quiz set still what the session was built from? ONE
 * `GetQuizSetsByIds([quizSetId], with_content_hash)` call per view (the hash is the same function
 * content uses for the snapshot), fail-soft: whatever goes wrong, the view still answers 200 with
 * `snapshotOutdated: null`.
 */
@Injectable()
export class SnapshotDrift {
    private readonly logger = new Logger(SnapshotDrift.name);

    constructor(private readonly content: ContentClient) {}

    async annotate<S extends DriftSession>(
        room: DriftRoom,
        sessions: S[],
        metadata: Metadata
    ): Promise<Array<S & SessionDrift>> {
        if (sessions.length === 0) return [];
        const current = await this.currentHash(room, metadata);
        return sessions.map((s) => ({
            ...s,
            snapshotOutdated: current === undefined ? null : current !== null && current !== s.quizSnapshotHash,
            canRefreshSnapshot: canRefresh(s, room.sourceDeleted),
        }));
    }

    /** The set's current hash; `null` when the set is gone; `undefined` when content could not answer. */
    private async currentHash(room: DriftRoom, metadata: Metadata): Promise<string | null | undefined> {
        if (room.sourceDeleted) return null;
        try {
            const rows = await this.content.getQuizSetsByIds([room.quizSetId], metadata, true);
            return rows[0]?.contentHash ?? null;
        } catch (error) {
            this.logger.warn(`Drift check skipped for quiz set ${room.quizSetId}: ${(error as Error).message}`);
            return undefined;
        }
    }
}
