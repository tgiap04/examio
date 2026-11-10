import { call } from './http';
import type { AssessmentTestApp } from './assessment-test-app';
import type { ContentBackend } from './fake-content';
import type { TokenUser } from './users';
import type { QuizSnapshotV1 } from '../../../src/modules/snapshot/quiz-snapshot';

/** Any harness, whatever content backend it runs on. */
type AnyApp = AssessmentTestApp<ContentBackend>;

/** `POST /examrooms` as the teacher, over a quiz set that lives in content. */
export async function createRoom(t: AnyApp, host: TokenUser, quizSetId: string, title = 'Room') {
    const res = await call(t.server, 'post', '/examrooms', host.token, { title, quizSetId });
    if (res.status !== 201) throw new Error(`room create answered ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body.examRoom.id as string;
}

/** `POST /examsessions` (snapshot taken from content). The window opened an hour ago and never closes, so students can start. */
export async function createSession(t: AnyApp, host: TokenUser, roomId: string, extra: object = {}) {
    return call(t.server, 'post', '/examsessions', host.token, {
        examRoomId: roomId,
        startTime: new Date(Date.now() - 3_600_000).toISOString(),
        assessType: 0,
        ...extra,
    });
}

export async function createSessionOk(t: AnyApp, host: TokenUser, roomId: string, extra: object = {}) {
    const res = await createSession(t, host, roomId, extra);
    if (res.status !== 201) throw new Error(`session create answered ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body.examSession as { id: string; quizSnapshotHash: string };
}

/** The stored snapshot of a session (the one reader of the column besides the service). */
export async function storedSnapshot(t: AnyApp, sessionId: string): Promise<QuizSnapshotV1> {
    const row = await t.prisma.examSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: { quizSnapshot: true },
    });
    return row.quizSnapshot as unknown as QuizSnapshotV1;
}

/** The owner edits a question in content (what the quiz-set editor does). */
export function editQuestion(t: AssessmentTestApp, quizSetId: string, questionId: string, patch: { question?: string; options?: string[]; answer?: string }) {
    t.content.editQuestion(quizSetId, questionId, patch);
}

/** The owner deletes the quiz set in content (the `content.quizset.deleted` event is the caller's to publish). */
export function deleteQuizSet(t: AssessmentTestApp, quizSetId: string) {
    t.content.remove(quizSetId);
}

/** Answers keyed by question id for `PUT :id/progress`: every question answered with `letter`. */
export const answerAll = (ids: string[], letter: string): Record<string, string> =>
    Object.fromEntries(ids.map((id) => [id, letter]));
