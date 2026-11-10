import {
    Inject,
    Injectable,
    OnModuleInit,
    Optional,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import type { Observable } from 'rxjs';
import { PROTO_FILES, gatewayControlV1 } from '@kmaedu/contracts';
import { ServiceMetadata } from '@kmaedu/auth-jwt';
import {
    CallOptions,
    GrpcClientRegistration,
    grpcErrorToHttpException,
    invokeRpc,
} from '@kmaedu/grpc';

export const GATEWAY_GRPC = 'GATEWAY_GRPC';

export const GATEWAY_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: GATEWAY_GRPC,
    pkg: PROTO_FILES.gatewayControl.pkg,
    protoFile: PROTO_FILES.gatewayControl.file,
    urlEnv: 'GATEWAY_GRPC_URL',
};

const RPC = `${PROTO_FILES.gatewayControl.pkg}.${gatewayControlV1.GATEWAY_CONTROL_SERVICE_NAME}`;

/**
 * admin -> gateway control plane. The gateway owns the page-flag key in Redis;
 * admin only pushes the full flag map through `SetPageFlags` (set-style, so a
 * retry is safe) with a service token (`aud = gateway`, allowlisted `admin`).
 */
@Injectable()
export class GatewayClient implements OnModuleInit {
    private control!: gatewayControlV1.GatewayControlClient;

    constructor(
        @Inject(GATEWAY_GRPC) private readonly client: ClientGrpc,
        // Explicit token: a `X | undefined` union would emit `Object` as design:paramtypes.
        @Optional() @Inject(ServiceMetadata) private readonly serviceMetadata?: ServiceMetadata
    ) {}

    onModuleInit(): void {
        this.control = this.client.getService<gatewayControlV1.GatewayControlClient>(
            gatewayControlV1.GATEWAY_CONTROL_SERVICE_NAME
        );
    }

    async setPageFlags(flags: Record<string, boolean>): Promise<void> {
        if (!this.serviceMetadata) {
            throw new ServiceUnavailableException({
                statusCode: 503,
                code: 'SERVICE_UNAVAILABLE',
                message: 'Gateway control is not configured (AUTH_TOKEN_URL / SERVICE_CLIENT_SECRET)',
            });
        }
        try {
            const metadata = await this.serviceMetadata.asService('gateway');
            await this.invoke('SetPageFlags', (o) => this.control.setPageFlags({ flags }, metadata, o));
        } catch (err) {
            throw grpcErrorToHttpException(err);
        }
    }

    private invoke<T>(method: string, call: (options: CallOptions) => Observable<T>): Promise<T> {
        return invokeRpc(`${RPC}/${method}`, call);
    }
}
