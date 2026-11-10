import { HttpException, Injectable } from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import { isGrpcStatus } from '@examio/grpc';
import { toContentHttpException } from '../../clients/content-errors';
import { ContentClient } from '../../clients/content.client';
import {
    assertSnapshotWithinCap,
    QuizSetDeletedException,
    QuizSetTooLargeException,
    snapshotFromContent,
    type QuizSnapshotV1,
} from './quiz-snapshot';

/**
 * Takes a snapshot of a quiz set from content-service, acting as its owner (`metadata` carries the
 * teacher's forwarded token). Used on session create and refresh only: never at exam time.
 */
@Injectable()
export class SnapshotTaker {
    constructor(private readonly content: ContentClient) {}

    async take(quizSetId: string, metadata: Metadata): Promise<QuizSnapshotV1> {
        let message;
        try {
            message = await this.content.getQuizSetSnapshot(quizSetId, metadata);
        } catch (error) {
            throw this.toHttp(error);
        }
        const snapshot = snapshotFromContent(message);
        assertSnapshotWithinCap(snapshot);
        return snapshot;
    }

    private toHttp(error: unknown): HttpException {
        if (isGrpcStatus(error, status.NOT_FOUND)) return new QuizSetDeletedException();
        if (isGrpcStatus(error, status.RESOURCE_EXHAUSTED)) return new QuizSetTooLargeException();
        return toContentHttpException(error);
    }
}
