import { status } from '@grpc/grpc-js';
import { rpcError } from '../wallet/wallet-money.service';

export const DEFAULT_PAGE = 20;
export const MAX_PAGE = 100;

export interface KeysetCursor {
    at: Date;
    id: string;
}

export const clampLimit = (limit: number): number =>
    !Number.isInteger(limit) || limit <= 0 ? DEFAULT_PAGE : Math.min(limit, MAX_PAGE);

export const encodeCursor = (row: { createdAt: Date; id: string }): string =>
    Buffer.from(`${row.createdAt.getTime()}:${row.id}`).toString('base64url');

export function decodeCursor(cursor: string): KeysetCursor | null {
    if (!cursor) return null;
    const decoded = Buffer.from(cursor, 'base64url').toString();
    const sep = decoded.indexOf(':');
    const ms = Number(decoded.slice(0, sep));
    const id = decoded.slice(sep + 1);
    if (sep < 1 || !Number.isFinite(ms) || !id) {
        throw rpcError(status.INVALID_ARGUMENT, 'INVALID_CURSOR');
    }
    return { at: new Date(ms), id };
}

/** `ORDER BY createdAt DESC, id DESC` keyset predicate for Prisma `where`. */
export const afterCursor = (c: KeysetCursor | null) =>
    c
        ? {
              OR: [
                  { createdAt: { lt: c.at } },
                  { createdAt: c.at, id: { lt: c.id } },
              ],
          }
        : {};
