import { Injectable } from '@nestjs/common';
import { buildMetadata } from '@examio/grpc';
import type { R2DeleteResult, R2DeleteSender } from '@examio/messaging';
import { R2Client } from './r2.client';

/**
 * The worker retries with backoff itself, and its claim lease is sized from this deadline
 * (3 attempts x 10 s from `invokeRpc` stay far inside the 120 s lease).
 */
const WORKER_DELETE_DEADLINE_MS = 10_000;

/** Delivers a batch of the delete-task worker to r2.v1 `DeleteObjects` as `svc:document`. */
@Injectable()
export class R2DeleteObjectsSender implements R2DeleteSender {
    constructor(private readonly r2: R2Client) {}

    deleteObjects(keys: string[]): Promise<R2DeleteResult> {
        return this.r2.deleteObjectsPartial(keys, buildMetadata(), WORKER_DELETE_DEADLINE_MS);
    }
}
