import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES, authV1 } from '@examio/contracts';
import {
    GrpcClientRegistration,
    grpcErrorToHttpException,
    invokeRpc,
} from '@examio/grpc';

export const AUTH_GRPC = 'AUTH_GRPC';

export const AUTH_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: AUTH_GRPC,
    pkg: PROTO_FILES.auth.pkg,
    protoFile: PROTO_FILES.auth.file,
    urlEnv: 'AUTH_GRPC_URL',
};

const RPC = `${PROTO_FILES.auth.pkg}.${authV1.AUTH_SERVICE_NAME}`;

/**
 * admin -> auth. Every call carries the CALLING admin's own access token as
 * metadata (`forwardUser(req)`): auth takes the actor from the token `sub`
 * and re-checks it against the DB. Nothing here ever sends an actor id.
 */
@Injectable()
export class AuthClient implements OnModuleInit {
    private auth!: authV1.AuthServiceClient;

    constructor(@Inject(AUTH_GRPC) private readonly client: ClientGrpc) {}

    onModuleInit(): void {
        this.auth = this.client.getService<authV1.AuthServiceClient>(
            authV1.AUTH_SERVICE_NAME
        );
    }

    /** Auth errors surface as the matching HttpException (LAST_SYSTEM_ADMIN -> 409, ...). */
    async setSystemAdmin(
        userId: string,
        isSystemAdmin: boolean,
        metadata: Metadata
    ): Promise<authV1.SetSystemAdminResponse> {
        try {
            // Not idempotent-listed: never retried.
            return await invokeRpc(`${RPC}/SetSystemAdmin`, (options) =>
                this.auth.setSystemAdmin(
                    { userId, isSystemAdmin, reason: '' },
                    metadata,
                    options
                )
            );
        } catch (err) {
            throw grpcErrorToHttpException(err);
        }
    }
}
