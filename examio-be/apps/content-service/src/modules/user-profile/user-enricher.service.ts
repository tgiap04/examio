import { Injectable } from '@nestjs/common';
import { UserEnricher as BaseUserEnricher } from '@examio/grpc';
import { AuthClient } from '../../clients/auth.client';

/**
 * Generic user/host enrichment lives in `@examio/grpc` (shared with study-room and assessment);
 * content only binds it to its own auth client (and its own profile cache prefix).
 */
@Injectable()
export class UserEnricher extends BaseUserEnricher {
    constructor(auth: AuthClient) {
        super(auth);
    }
}
