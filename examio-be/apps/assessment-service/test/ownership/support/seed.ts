import { rid, type AssessmentTestApp } from './assessment-test-app';
import type { ContentBackend, SeedQuestion, SeededQuizSet } from './fake-content';

/** Any harness, whatever content backend it runs on. */
type AnyApp = AssessmentTestApp<ContentBackend>;
import type { QuizSnapshotV1 } from '../../../src/modules/snapshot/quiz-snapshot';

/** Fixtures for the assessment family. Every call creates fresh rows with unique ids. */
/** A quiz set in content (labels + questions in creation order), owned by `ownerId`. */
export async function seedQuizSet(
    t: AssessmentTestApp,
    ownerId: string,
    labels: string[] = [],
    questions?: SeedQuestion[]
): Promise<SeededQuizSet> {
    return t.content.addQuizSet(ownerId, labels, questions);
}

/** A room over `quizSetId` (a plain column: the set need not exist in content), as `POST /examrooms` would have stored it. */
export async function seedExamRoom(t: AnyApp, hostId: string, quizSetId = `qs_${rid()}`, quizSetTitle = 'seed quiz') {
    const id = `er_${rid()}`;
    await t.prisma.examRoom.create({
        data: { id, title: `room ${id}`, description: 'd', quizSetId, quizSetTitle, hostId },
    });
    return { id, quizSetId };
}

/** A snapshot with `n` questions (ids `<tag>1..n`, answer "A", one label) for rows that bypass content. */
export function inlineSnapshot(n = 1, tag = 'q', hash = `hash_${rid()}`): QuizSnapshotV1 {
    return {
        v: 1,
        quizSetId: 'qs_inline',
        title: 'inline',
        takenAt: new Date().toISOString(),
        contentHash: hash,
        labels: [{ id: 'l1', name: 'L1', order: 0 }],
        questions: Array.from({ length: n }, (_, i) => ({
            id: `${tag}${i + 1}`,
            question: `Question ${i + 1}`,
            options: ['A1', 'B1', 'C1', 'D1'],
            answer: 'A',
            labelId: 'l1',
            order: i,
        })),
    };
}

export interface SessionOptions {
    assessType?: 0 | 1;
    accessCode?: string | null;
    whitelist?: string[];
    allowRetake?: boolean;
    showAnswersAfterSubmit?: boolean;
    /** 0 UPCOMING, 1 ONGOING (default), 2 ENDED. */
    status?: number;
    snapshot?: QuizSnapshotV1;
}

/** An ONGOING session (window around now) of `roomId`, holding `snapshot` (default: one inline question). */
export async function seedExamSession(t: AnyApp, roomId: string, o: SessionOptions = {}) {
    const id = `es_${rid()}`;
    const now = Date.now();
    const snapshot = o.snapshot ?? inlineSnapshot();
    await t.prisma.examSession.create({
        data: {
            id,
            examRoomId: roomId,
            status: o.status ?? 1,
            startTime: new Date(now - 3_600_000),
            endTime: new Date(now + 3_600_000),
            assessType: o.assessType ?? 1,
            accessCode: o.accessCode ?? null,
            whitelist: o.whitelist ?? [],
            allowRetake: o.allowRetake ?? false,
            showAnswersAfterSubmit: o.showAnswersAfterSubmit ?? true,
            quizSnapshot: snapshot as never,
            quizSnapshotHash: snapshot.contentHash,
        },
    });
    return id;
}

export async function seedAttempt(t: AnyApp, sessionId: string, userId: string, status = 0) {
    const id = `ea_${rid()}`;
    await t.prisma.examAttempt.create({
        data: { id, examSessionId: sessionId, userId, score: 0, startedAt: new Date(), status },
    });
    return id;
}
