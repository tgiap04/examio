import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { PROTO_FILES, authV1 } from '@examio/contracts';
import { GrpcClientRegistration, invokeRpc } from '@examio/grpc';
import { ServiceMetadata } from '@examio/auth-jwt';

export const AUTH_GRPC = 'AUTH_GRPC';

export const AUTH_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: AUTH_GRPC,
    pkg: PROTO_FILES.auth.pkg,
    protoFile: PROTO_FILES.auth.file,
    urlEnv: 'AUTH_GRPC_URL',
};

const RPC = `${PROTO_FILES.auth.pkg}.${authV1.AUTH_SERVICE_NAME}`;

/** finance -> auth, always as `svc:finance` (explicit metadata, never ambient). */
@Injectable()
export class AuthClient implements OnModuleInit {
    private auth!: authV1.AuthServiceClient;

    constructor(
        @Inject(AUTH_GRPC) private readonly client: ClientGrpc,
        private readonly serviceMetadata: ServiceMetadata
    ) {}

    onModuleInit(): void {
        this.auth = this.client.getService<authV1.AuthServiceClient>(authV1.AUTH_SERVICE_NAME);
    }

    async listUsers(request: authV1.ListUsersRequest): Promise<authV1.ListUsersResponse> {
        const metadata = await this.serviceMetadata.asService('auth');
        return invokeRpc(`${RPC}/ListUsers`, (options) =>
            this.auth.listUsers(request, metadata, options)
        );
    }
}
