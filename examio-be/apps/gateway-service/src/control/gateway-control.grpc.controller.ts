import { Controller } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { gatewayControlV1 } from '@examio/contracts';
import { ServiceOnly } from '@examio/auth-jwt';
import { AuthStateService } from '../pipeline/auth-state.service';
import { ConfigService } from '../services/config.service';

function invalid(message: string): never {
    throw new RpcException({ code: status.INVALID_ARGUMENT, message });
}

function wholeNumber(value: string | undefined, field: string): number {
    const n = Number(value);
    if (!value || !Number.isSafeInteger(n) || n < 0) invalid(`${field} must be a non-negative integer`);
    return n;
}

/**
 * Control plane for auth and admin (internal port only). Callers present a
 * service token with `aud = gateway`; each RPC is allowlisted by service name.
 * Ban is NOT here: auth's `SetUserStatus` calls `InvalidateUser` after commit.
 */
@Controller()
@gatewayControlV1.GatewayControlControllerMethods()
export class GatewayControlGrpcController implements gatewayControlV1.GatewayControlController {
    constructor(
        private readonly state: AuthStateService,
        private readonly config: ConfigService
    ) {}

    @ServiceOnly('auth')
    async revokeSession(
        data: gatewayControlV1.RevokeSessionRequest
    ): Promise<gatewayControlV1.RevokeSessionResponse> {
        if (!data.sid) invalid('sid is required');
        await this.state.revokeSession(data.sid, wholeNumber(data.exp, 'exp'));
        return {};
    }

    @ServiceOnly('auth')
    async invalidateUser(
        data: gatewayControlV1.InvalidateUserRequest
    ): Promise<gatewayControlV1.InvalidateUserResponse> {
        if (!data.userId) invalid('user_id is required');
        await this.state.raiseAuthzVersion(data.userId, wholeNumber(data.authzVersion, 'authz_version'));
        return {};
    }

    @ServiceOnly('admin')
    async setPageFlags(
        data: gatewayControlV1.SetPageFlagsRequest
    ): Promise<gatewayControlV1.SetPageFlagsResponse> {
        await this.config.setPages({ ...data.flags });
        return {};
    }
}
