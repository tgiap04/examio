/**
 * Who may read or change an exam attempt. Pure decision over the attempt's own
 * relations: the examinee (`attempt.userId`) or the host of the room the
 * session belongs to. The caller passes in what the VIEWER may do (computed
 * from the viewer's token permissions); nothing here looks at anyone's
 * account record, so it can not change with an owner's current standing.
 */
export type AttemptRelation = 'examinee' | 'host';

export interface AttemptAccessRow {
    userId: string;
    examSession: { examRoom: { hostId: string } };
}

export interface ViewerCapabilities {
    /** May take exams (`exam:take`): needed to act as the examinee. */
    canTake: boolean;
    /** May view results (`exam_result:view`): needed to act as the host on a read. */
    canViewResults: boolean;
    /** May manage sessions (`exam_session:manage`): needed to act as the host on a write. */
    canManageSessions: boolean;
}

export function attemptRelation(
    attempt: AttemptAccessRow,
    viewerId: string,
    mode: 'read' | 'write',
    can: ViewerCapabilities
): AttemptRelation | null {
    if (attempt.userId === viewerId && can.canTake) return 'examinee';
    const isHost = attempt.examSession.examRoom.hostId === viewerId;
    if (
        isHost &&
        (mode === 'read' ? can.canViewResults : can.canManageSessions)
    ) {
        return 'host';
    }
    return null;
}
