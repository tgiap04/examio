import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import type { Observable } from 'rxjs';
import { PROTO_FILES, authUsersV1 } from '@kmaedu/contracts';
import {
    CallOptions,
    GrpcClientRegistration,
    grpcErrorToHttpException,
    invokeRpc,
} from '@kmaedu/grpc';

export const AUTH_USERS_GRPC = 'AUTH_USERS_GRPC';

export const AUTH_USERS_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: AUTH_USERS_GRPC,
    pkg: PROTO_FILES.authUsers.pkg,
    protoFile: PROTO_FILES.authUsers.file,
    urlEnv: 'AUTH_GRPC_URL',
};

const RPC = `${PROTO_FILES.authUsers.pkg}.${authUsersV1.AUTH_USER_SERVICE_NAME}`;

/**
 * admin -> auth `AuthUserService`. Every call forwards the CALLING admin's own
 * access token: auth takes the actor from its `sub` and checks `user:manage` /
 * `stats:read`. Only the reads in IDEMPOTENT_RPCS are ever retried.
 */
@Injectable()
export class AuthUsersClient implements OnModuleInit {
    private users!: authUsersV1.AuthUserServiceClient;

    constructor(@Inject(AUTH_USERS_GRPC) private readonly client: ClientGrpc) {}

    onModuleInit(): void {
        this.users = this.client.getService<authUsersV1.AuthUserServiceClient>(
            authUsersV1.AUTH_USER_SERVICE_NAME
        );
    }

    updateUserAdmin(req: authUsersV1.UpdateUserAdminRequest, md: Metadata) {
        return this.call('UpdateUserAdmin', (o) => this.users.updateUserAdmin(req, md, o));
    }

    getUserAdminDetail(userId: string, md: Metadata) {
        return this.call('GetUserAdminDetail', (o) =>
            this.users.getUserAdminDetail({ userId }, md, o)
        );
    }

    getUserStats(req: authUsersV1.GetUserStatsRequest, md: Metadata) {
        return this.call('GetUserStats', (o) => this.users.getUserStats(req, md, o));
    }

    private async call<T>(
        method: string,
        invoke: (options: CallOptions) => Observable<T>
    ): Promise<T> {
        try {
            return await invokeRpc(`${RPC}/${method}`, invoke);
        } catch (err) {
            throw grpcErrorToHttpException(err);
        }
    }
}
