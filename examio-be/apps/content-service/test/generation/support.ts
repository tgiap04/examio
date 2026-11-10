import * as request from 'supertest';
import { bootContentApp, rid, type ContentTestApp, type TestUser } from '../ownership/support/content-test-app';
import { call } from '../ownership/support/http';
import { GenerationReaper } from '../../src/modules/ai/generation-reaper.service';
import { GenerationJobService } from '../../src/modules/ai/generation-job.service';

export { bootContentApp, call, rid, type ContentTestApp, type TestUser };

export const MB = 1024 * 1024;

export interface Teacher extends TestUser {
    token: string;
}

/** A TEACHER (the only role with `ai:generate`) and its bearer token. */
export async function teacher(t: ContentTestApp): Promise<Teacher> {
    const user = await t.createUser(['TEACHER']);
    return { ...user, token: await t.tokenFor(user) };
}

export interface GenerateOptions {
    filename?: string;
    bytes?: number;
    typeResult?: '1' | '2';
    quantityQuizz?: string;
    quantityFlashcard?: string;
    keyword?: string;
    isNarrowSearch?: string;
    modelType?: string;
}

/** `POST /ai/generate-from-file` as the teacher. The buffer length is the file size. */
export function generate(t: ContentTestApp, user: Teacher, opts: GenerateOptions = {}): request.Test {
    const req = request(t.server)
        .post('/api/v1/ai/generate-from-file')
        .set('Authorization', `Bearer ${user.token}`)
        .field('typeResult', opts.typeResult ?? '1');
    for (const key of ['quantityQuizz', 'quantityFlashcard', 'keyword', 'isNarrowSearch', 'modelType'] as const) {
        const value = opts[key];
        if (value !== undefined) req.field(key, value);
    }
    return req.attach('file', Buffer.alloc(opts.bytes ?? MB, 7), {
        filename: opts.filename ?? `lecture-${rid()}.pdf`,
        contentType: 'application/pdf',
    });
}

export const jobRow = (t: ContentTestApp, id: string) => t.prisma.generationJob.findUniqueOrThrow({ where: { id } });

/** The content outbox rows of one event type that concern `jobId`. */
export async function outboxFor(t: ContentTestApp, type: string, jobId: string) {
    const rows = await t.prisma.outboxEvent.findMany({ where: { type }, orderBy: { seq: 'asc' } });
    return rows.filter((row) => (row.envelope as { data?: { jobId?: string } }).data?.jobId === jobId);
}

/** Moves a job back in time (the reaper only looks at jobs older than its thresholds). */
export const ageJob = (t: ContentTestApp, id: string, minutes: number) =>
    t.prisma.$executeRaw`UPDATE "GenerationJob" SET "createdAt" = now() - (${minutes}::int * interval '1 minute'),
        "updatedAt" = now() - (${minutes}::int * interval '1 minute') WHERE id = ${id}`;

/** One watchdog pass, as the worker role runs it every minute. */
export const reap = (t: ContentTestApp) => new GenerationReaper(t.app.get(GenerationJobService)).tick();

export const quizItems = (n = 3) =>
    Array.from({ length: n }, (_, i) => ({
        question: `Q${i + 1}?`,
        options: ['a', 'b', 'c', 'd'],
        answer: 'A',
        sourcePageRange: '1-2',
    }));

export const flashcardItems = (n = 3) =>
    Array.from({ length: n }, (_, i) => ({ question: `Front ${i + 1}`, answer: `Back ${i + 1}`, sourcePageRange: '1' }));
