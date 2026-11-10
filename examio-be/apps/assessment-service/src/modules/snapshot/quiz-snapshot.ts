import { HttpException } from '@nestjs/common';
import { z } from 'zod';
import type { contentV1 } from '@examio/contracts';
import type { Prisma } from '../../prisma';

/** Serialized snapshots above this are refused: `422 QUIZSET_TOO_LARGE` on create and refresh. */
export const SNAPSHOT_MAX_BYTES = 1024 * 1024;

const labelSchema = z.object({
    id: z.string(),
    name: z.string(),
    order: z.number().int(),
    color: z.string().optional(),
});

const questionSchema = z.object({
    id: z.string(),
    question: z.string(),
    options: z.array(z.string()),
    /** The correct option's letter ("A", "B", ...). Never leaves the server toward a student before submit. */
    answer: z.string(),
    labelId: z.string().nullable(),
    order: z.number().int(),
});

/** What `ExamSession.quizSnapshot` stores. Validated on every read from the database. */
export const quizSnapshotSchema = z.object({
    v: z.literal(1),
    quizSetId: z.string(),
    title: z.string(),
    takenAt: z.string(),
    contentHash: z.string(),
    labels: z.array(labelSchema),
    questions: z.array(questionSchema),
});

export type QuizSnapshotV1 = z.infer<typeof quizSnapshotSchema>;
export type SnapshotQuestion = QuizSnapshotV1['questions'][number];
export type SnapshotLabel = QuizSnapshotV1['labels'][number];

/** content-service's `QuizSetSnapshot` message as the stored shape (questions in the order content sent). */
export function snapshotFromContent(message: contentV1.QuizSetSnapshot): QuizSnapshotV1 {
    return {
        v: 1,
        quizSetId: message.quizSetId,
        title: message.title,
        takenAt: message.takenAt,
        contentHash: message.contentHash,
        labels: message.labels.map((l) => ({
            id: l.id,
            name: l.name,
            order: l.order,
            ...(l.color ? { color: l.color } : {}),
        })),
        questions: [...message.questions]
            .sort((a, b) => a.order - b.order)
            .map((q) => ({
                id: q.id,
                question: q.question,
                options: [...q.options],
                answer: q.answer,
                labelId: q.labelId ?? null,
                order: q.order,
            })),
    };
}

/** The `ExamSession` columns a snapshot is written to (session create and refresh). */
export function snapshotColumns(
    snapshot: QuizSnapshotV1
): { quizSnapshot: Prisma.InputJsonValue; quizSnapshotHash: string } {
    return {
        quizSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        quizSnapshotHash: snapshot.contentHash,
    };
}

export class QuizSetTooLargeException extends HttpException {
    constructor() {
        super(
            {
                statusCode: 422,
                code: 'QUIZSET_TOO_LARGE',
                message: 'Bộ đề quá lớn để tạo phiên thi (tối đa 1 MB nội dung)',
            },
            422
        );
    }
}

/** Throws `QUIZSET_TOO_LARGE` unless the serialized snapshot fits `SNAPSHOT_MAX_BYTES`. */
export function assertSnapshotWithinCap(snapshot: QuizSnapshotV1): void {
    if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > SNAPSHOT_MAX_BYTES) {
        throw new QuizSetTooLargeException();
    }
}

/** The quiz set behind a room is gone (deleted, or no longer the host's): no session can be made or refreshed from it. */
export class QuizSetDeletedException extends HttpException {
    constructor() {
        super(
            {
                statusCode: 422,
                code: 'QUIZSET_DELETED',
                message: 'Bộ đề của phòng thi đã bị xóa, không thể tạo hoặc cập nhật phiên thi',
            },
            422
        );
    }
}
