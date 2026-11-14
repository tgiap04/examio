import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import type { Observable } from 'rxjs';
import { PROTO_FILES, authV1 } from '@kmaedu/contracts';
import {
    CallOptions,
    GrpcClientRegistration,
    grpcErrorToHttpException,
    invokeRpc,
} from '@kmaedu/grpc';

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

    getUser(userId: string, metadata: Metadata): Promise<authV1.GetUserResponse> {
        return this.call('GetUser', (o) => this.auth.getUser({ userId }, metadata, o));
    }

    /** One batched read for the distinct ids of a page (`user:manage` on the forwarded token). */
    getUsersByIds(userIds: string[], metadata: Metadata): Promise<authV1.GetUsersByIdsResponse> {
        return this.call('GetUsersByIds', (o) => this.auth.getUsersByIds({ userIds }, metadata, o));
    }

    listUsers(
        request: authV1.ListUsersRequest,
        metadata: Metadata
    ): Promise<authV1.ListUsersResponse> {
        return this.call('ListUsers', (o) => this.auth.listUsers(request, metadata, o));
    }

    setUserRole(
        userId: string,
        role: authV1.BaseRole,
        reason: string,
        metadata: Metadata
    ): Promise<authV1.SetUserRoleResponse> {
        return this.call('SetUserRole', (o) =>
            this.auth.setUserRole({ userId, role, reason }, metadata, o)
        );
    }

    setSystemAdmin(
        userId: string,
        isSystemAdmin: boolean,
        metadata: Metadata,
        reason = ''
    ): Promise<authV1.SetSystemAdminResponse> {
        return this.call('SetSystemAdmin', (o) =>
            this.auth.setSystemAdmin({ userId, isSystemAdmin, reason }, metadata, o)
        );
    }

    setUserStatus(
        userId: string,
        isBanned: boolean,
        metadata: Metadata,
        reason = ''
    ): Promise<authV1.SetUserStatusResponse> {
        return this.call('SetUserStatus', (o) =>
            this.auth.setUserStatus({ userId, isBanned, reason }, metadata, o)
        );
    }

    listRoleChanges(
        request: authV1.ListRoleChangesRequest,
        metadata: Metadata
    ): Promise<authV1.ListRoleChangesResponse> {
        return this.call('ListRoleChanges', (o) =>
            this.auth.listRoleChanges(request, metadata, o)
        );
    }

    /**
     * Auth errors surface as the matching HttpException (LAST_SYSTEM_ADMIN -> 409, ...).
     * Only the reads listed in IDEMPOTENT_RPCS are ever retried; writes never are.
     */
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
