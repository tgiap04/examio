import { Controller } from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { contentV1 } from '@kmaedu/contracts';
import { RequirePermissions, RequirePermissionsOrService, principalOfMetadata } from '@kmaedu/auth-jwt';
import {
    MAX_SUMMARY_IDS,
    QuizSetSnapshotService,
    SNAPSHOT_SCHEMA_VERSION,
} from '../modules/quizset/quiz-set-snapshot.service';

/**
 * The acting user of an RPC: the `sub` of the forwarded user token. A service token never acts here
 * (there is no owner to scope to), and a request without any token never reaches this far (the
 * global guard answers UNAUTHENTICATED).
 */
function actorOf(metadata: Metadata): string {
    const principal = principalOfMetadata(metadata);
    if (principal?.kind !== 'user') {
        throw new RpcException({ code: status.PERMISSION_DENIED, message: 'PERMISSION_DENIED' });
    }
    return principal.id;
}

const notFound = () => new RpcException({ code: status.NOT_FOUND, message: 'NOT_FOUND' });
const invalidArgument = (message: string) => new RpcException({ code: status.INVALID_ARGUMENT, message });

/**
 * `kmaedu.content.v1.ContentService` for assessment-service. Owner-scoped by the forwarded token: a
 * quiz set that is missing or not the caller's is NOT_FOUND (or omitted), never PERMISSION_DENIED.
 */
@Controller()
@contentV1.ContentServiceControllerMethods()
export class ContentGrpcController implements contentV1.ContentServiceController {
    constructor(private readonly snapshots: QuizSetSnapshotService) {}

    @RequirePermissions('quizset:manage')
    async getQuizSetSnapshot(
        request: contentV1.GetQuizSetSnapshotRequest,
        metadata: Metadata
    ): Promise<contentV1.QuizSetSnapshot> {
        const ownerId = actorOf(metadata);
        if (!request.quizSetId.trim()) {
            throw invalidArgument('quiz_set_id is required');
        }
        const set = await this.snapshots.snapshot(ownerId, request.quizSetId);
        if (!set) throw notFound();
        return {
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            quizSetId: set.id,
            title: set.title,
            ownerId: set.ownerId,
            takenAt: new Date().toISOString(),
            contentHash: set.contentHash,
            labels: set.labels.map((l) => ({ id: l.id, name: l.name, order: l.order, color: l.color ?? undefined })),
            questions: set.questions.map((q) => ({
                id: q.id,
                question: q.question,
                options: q.options,
                answer: q.answer,
                labelId: q.labelId ?? undefined,
                order: q.order,
            })),
        };
    }

    @RequirePermissions('quizset:manage')
    async getQuizSetsByIds(
        request: contentV1.GetQuizSetsByIdsRequest,
        metadata: Metadata
    ): Promise<contentV1.GetQuizSetsByIdsResponse> {
        const ownerId = actorOf(metadata);
        if (request.ids.length > MAX_SUMMARY_IDS) {
            throw invalidArgument(`at most ${MAX_SUMMARY_IDS} ids per call`);
        }
        const rows = await this.snapshots.summaries(ownerId, request.ids, request.withContentHash);
        return {
            quizSets: rows.map((row) => ({
                id: row.id,
                title: row.title,
                contentHash: row.contentHash,
                questionCount: row.questionCount,
            })),
        };
    }

    // Any verified user (the history stats are shown to students, whose counts are zero); the body names
    // no user, the token `sub` is the only subject. No service caller: there is no user to count for.
    @RequirePermissionsOrService([], { callers: [] })
    async getUserContentStats(
        _request: contentV1.GetUserContentStatsRequest,
        metadata: Metadata
    ): Promise<contentV1.UserContentStats> {
        const stats = await this.snapshots.stats(actorOf(metadata));
        return { quizSetCount: stats.quizSetCount, flashcardSetCount: stats.flashcardSetCount };
    }
}
