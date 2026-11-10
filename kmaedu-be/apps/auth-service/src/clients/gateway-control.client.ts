import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { PROTO_FILES, gatewayControlV1 } from '@kmaedu/contracts';
import { CallOptions, GrpcClientRegistration, invokeRpc } from '@kmaedu/grpc';
import type { Metadata } from '@grpc/grpc-js';
import type { Observable } from 'rxjs';
import { ServiceMetadata } from '@kmaedu/auth-jwt';
import { accessTtlSeconds } from '@kmaedu/common';

export const GATEWAY_GRPC = 'GATEWAY_GRPC';

export const GATEWAY_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: GATEWAY_GRPC,
    pkg: PROTO_FILES.gatewayControl.pkg,
    protoFile: PROTO_FILES.gatewayControl.file,
    urlEnv: 'GATEWAY_GRPC_URL',
};

const RPC = `${PROTO_FILES.gatewayControl.pkg}.${gatewayControlV1.GATEWAY_CONTROL_SERVICE_NAME}`;

/** Fast-path signals to the gateway. Off unless `GATEWAY_CONTROL_ENABLED=true`. */
export const gatewayControlEnabled = (): boolean =>
    process.env.GATEWAY_CONTROL_ENABLED === 'true';

const REVOKE_SKEW_SECONDS = 60;

/**
 * Epoch-seconds until which a revoked session needs denying: the longest-lived
 * access token it could still hold (TTL + skew), after which it expires anyway.
 */
export function sessionRevokeExp(nowMs = Date.now()): number {
    return Math.floor(nowMs / 1000) + accessTtlSeconds() + REVOKE_SKEW_SECONDS;
}

/**
 * Calls into `GatewayControl`. Fail-soft: a lost `InvalidateUser` is covered by
 * the durable `auth.user.authz_changed` event; a lost `RevokeSession` is not,
 * but the session is already deactivated in the DB, so refresh cannot renew
 * the token and it dies within one access TTL (the failure count surfaces it).
 */
@Injectable()
export class GatewayControlClient implements OnModuleInit {
    private readonly logger = new Logger(GatewayControlClient.name);
    private control?: gatewayControlV1.GatewayControlClient;
    private failures = 0;

    constructor(
        @Optional() @Inject(GATEWAY_GRPC) private readonly client: ClientGrpc | undefined,
        // Explicit token: a `X | undefined` union emits `Object` as design:paramtypes,
        // so without @Inject Nest would silently inject nothing.
        @Optional() @Inject(ServiceMetadata) private readonly serviceMetadata: ServiceMetadata | undefined
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
        await this.call('InvalidateUser', `user=${userId} av=${authzVersion}`, (control, metadata, options) =>
            control.invalidateUser({ userId, authzVersion: String(authzVersion) }, metadata, options)
        );
    }

    /** `RevokeSession(sid, exp)`: the next request carrying that session's token gets 401 SESSION_REVOKED. */
    async revokeSession(sid: string, expEpochSeconds: number): Promise<void> {
        await this.call('RevokeSession', `sid=${sid}`, (control, metadata, options) =>
            control.revokeSession({ sid, exp: String(expEpochSeconds) }, metadata, options)
        );
    }

    private async call(
        method: 'InvalidateUser' | 'RevokeSession',
        subject: string,
        invoke: (
            control: gatewayControlV1.GatewayControlClient,
            metadata: Metadata,
            options: CallOptions
        ) => Observable<unknown>
    ): Promise<void> {
        if (!gatewayControlEnabled() || !this.control || !this.serviceMetadata) {
            this.logger.debug(`GatewayControl disabled; skipping ${method}(${subject})`);
            return;
        }
        try {
            const metadata = await this.serviceMetadata.asService('gateway');
            await invokeRpc(`${RPC}/${method}`, (options) => invoke(this.control!, metadata, options));
        } catch (err) {
            this.failures++;
            this.logger.warn(
                `${method}(${subject}) failed: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    }
}
