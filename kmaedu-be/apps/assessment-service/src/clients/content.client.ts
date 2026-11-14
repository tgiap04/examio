import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES, contentV1 } from '@kmaedu/contracts';
import { GrpcClientRegistration, invokeRpc } from '@kmaedu/grpc';

export const CONTENT_GRPC = 'CONTENT_GRPC';

/** A snapshot is capped at 1 MB of JSON; the channel allows more so that a bigger one fails as a 422, not as a transport error. */
const SNAPSHOT_CHANNEL_BYTES = 8 * 1024 * 1024;

export const CONTENT_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: CONTENT_GRPC,
    pkg: PROTO_FILES.content.pkg,
    protoFile: PROTO_FILES.content.file,
    urlEnv: 'CONTENT_GRPC_URL',
    maxMessageBytes: SNAPSHOT_CHANNEL_BYTES,
};

const RPC = `${PROTO_FILES.content.pkg}.${contentV1.CONTENT_SERVICE_NAME}`;

/** Reading every question of a big set takes longer than a lookup. */
const SNAPSHOT_DEADLINE_MS = 10_000;

/**
 * assessment -> content (`kmaedu.content.v1.ContentService`). Every RPC acts as the quiz set's owner:
 * `metadata` MUST carry the teacher's forwarded user token (`forwardUser(req)`); content refuses
 * service tokens. Called on teacher paths only (session create / refresh, host drift view, room
 * create / list) and with the caller's own token for the history stats. Never at exam time.
 */
@Injectable()
export class ContentClient implements OnModuleInit {
    private service!: contentV1.ContentServiceClient;

    constructor(@Inject(CONTENT_GRPC) private readonly client: ClientGrpc) {}

    onModuleInit(): void {
        this.service = this.client.getService<contentV1.ContentServiceClient>(contentV1.CONTENT_SERVICE_NAME);
    }

    /** The owner's whole quiz set; NOT_FOUND when it is missing or not the caller's. */
    getQuizSetSnapshot(quizSetId: string, metadata: Metadata): Promise<contentV1.QuizSetSnapshot> {
        return invokeRpc(`${RPC}/GetQuizSetSnapshot`, (o) => this.service.getQuizSetSnapshot({ quizSetId }, metadata, o), {
            deadlineMs: SNAPSHOT_DEADLINE_MS,
        });
    }

    /** The caller's own sets among `ids` (at most 50); a missing or foreign id is simply absent. */
    async getQuizSetsByIds(
        ids: string[],
        metadata: Metadata,
        withContentHash = false
    ): Promise<contentV1.QuizSetSummary[]> {
        const res = await invokeRpc(`${RPC}/GetQuizSetsByIds`, (o) =>
            this.service.getQuizSetsByIds({ ids, withContentHash }, metadata, o)
        );
        return res.quizSets;
    }

    getUserContentStats(metadata: Metadata): Promise<contentV1.UserContentStats> {
        return invokeRpc(`${RPC}/GetUserContentStats`, (o) => this.service.getUserContentStats({}, metadata, o));
    }
}
