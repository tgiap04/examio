import {
    BadRequestException,
    ConflictException,
    HttpException,
    NotFoundException,
} from '@nestjs/common';

/**
 * First line of a `catch` that would otherwise wrap everything as a 500: lets
 * errors that already carry the right status through (HttpException, and the
 * Prisma codes that mean "not found" / "duplicate" / "bad reference") and
 * returns for anything truly unexpected, which the caller then wraps.
 */
export function rethrowKnown(error: unknown): void {
    if (error instanceof HttpException) throw error;
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 'P2025') throw new NotFoundException('Resource not found');
    if (code === 'P2002')
        throw new ConflictException('Resource already exists');
    if (code === 'P2003') throw new BadRequestException('Invalid reference');
}
