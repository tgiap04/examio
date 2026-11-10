import * as request from 'supertest';
import type { Server } from 'http';
import type { PrismaService } from '../../src/prisma';
import { rid, type TestUser } from './document-test-app';

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** One request against the app; no token = anonymous. Paths are under `/api/v1`. */
export function call(server: Server, method: Method, path: string, token?: string, body?: object): request.Test {
    let req = request(server)[method](`/api/v1${path}`);
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
}

export const MB = 1024 * 1024;

/** A valid `POST /ai/upload` body: an object the user already stored under their own key. */
export function registerBody(user: TestUser, sizeBytes = 3 * MB) {
    const keyR2 = `ai-uploads/${user.id}/${rid()}-lecture.pdf`;
    return { filename: `lecture-${rid()}.pdf`, url: `https://r2.test/${keyR2}`, mimetype: 'application/pdf', size: sizeBytes, keyR2 };
}

export const outbox = (prisma: PrismaService, type: string) =>
    prisma.outboxEvent.findMany({ where: { type }, orderBy: { seq: 'asc' } });

export const outboxFor = async (prisma: PrismaService, type: string, storageId: string) =>
    (await outbox(prisma, type)).filter((row) => JSON.stringify(row.envelope).includes(storageId));

export const queuedKeys = async (prisma: PrismaService, keys: string[]): Promise<string[]> =>
    (
        await prisma.$queryRaw<Array<{ key: string }>>`
            SELECT key FROM r2_delete_tasks WHERE key = ANY(${keys}::text[]) ORDER BY key`
    ).map((r) => r.key);

/** Moves a row's creation back in time (the reaper only looks at rows older than 10 minutes). */
export const age = (prisma: PrismaService, id: string, minutes: number) =>
    prisma.$executeRaw`UPDATE "UserStorage" SET "createdAt" = now() - (${minutes}::int * interval '1 minute') WHERE id = ${id}`;
