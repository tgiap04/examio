import { Injectable } from '@nestjs/common';
import { UserEnricher as BaseUserEnricher } from '@kmaedu/grpc';
import { AuthClient } from '../../clients/auth.client';

/**
 * Generic user/host enrichment lives in `@kmaedu/grpc` (shared with study-room and assessment);
 * content only binds it to its own auth client (and its own profile cache prefix).
 */
@Injectable()
export class UserEnricher extends BaseUserEnricher {
    constructor(auth: AuthClient) {
        super(auth);
    }
}
