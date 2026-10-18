import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { PROTO_FILES, gatewayControlV1 } from '@examio/contracts';
import { GrpcClientRegistration, invokeRpc } from '@examio/grpc';
import { ServiceMetadata } from '@examio/auth-jwt';

export const GATEWAY_GRPC = 'GATEWAY_GRPC';

export const GATEWAY_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: GATEWAY_GRPC,
    pkg: PROTO_FILES.gatewayControl.pkg,
    protoFile: PROTO_FILES.gatewayControl.file,
    urlEnv: 'GATEWAY_GRPC_URL',
};

const RPC = `${PROTO_FILES.gatewayControl.pkg}.${gatewayControlV1.GATEWAY_CONTROL_SERVICE_NAME}`;

/** Fast-path stale-token signal. Off until phase 05 ships the gateway control server. */
export const gatewayControlEnabled = (): boolean =>
    process.env.GATEWAY_CONTROL_ENABLED === 'true';

/**
 * `InvalidateUser(userId, authzVersion)` after a committed authz change.
 * Fail-soft: the durable `auth.user.authz_changed` event covers a lost call.
 */
@Injectable()
export class GatewayControlClient implements OnModuleInit {
    private readonly logger = new Logger(GatewayControlClient.name);
    private control?: gatewayControlV1.GatewayControlClient;
    private failures = 0;

    constructor(
        @Optional() @Inject(GATEWAY_GRPC) private readonly client: ClientGrpc | undefined,
        @Optional() private readonly serviceMetadata: ServiceMetadata | undefined
    ) {}

    onModuleInit(): void {
        if (this.client) {
            this.control = this.client.getService<gatewayControlV1.GatewayControlClient>(
                gatewayControlV1.GATEWAY_CONTROL_SERVICE_NAME
            );
        }
    }

    /** Count of failed calls since boot (the metric until phase 17's stack exists). */
    get failureCount(): number {
        return this.failures;
    }

    async invalidateUser(userId: string, authzVersion: number): Promise<void> {
        if (!gatewayControlEnabled() || !this.control || !this.serviceMetadata) {
            this.logger.debug(`GatewayControl disabled; skipping InvalidateUser(${userId})`);
            return;
        }
        try {
            const metadata = await this.serviceMetadata.asService('gateway');
            await invokeRpc(`${RPC}/InvalidateUser`, (options) =>
                this.control!.invalidateUser({ userId, authzVersion: String(authzVersion) }, metadata, options)
            );
        } catch (err) {
            this.failures++;
            this.logger.warn(
                `InvalidateUser(${userId}, av=${authzVersion}) failed: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    }
}
