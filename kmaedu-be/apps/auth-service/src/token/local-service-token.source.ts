import type {
    IssuedServiceToken,
    ServiceTokenSource,
} from '@kmaedu/auth-jwt';
import type { TokenService } from './token.service';

/** Auth signs its own outbound service tokens locally (no HTTP round trip to itself). */
export class LocalServiceTokenSource implements ServiceTokenSource {
    constructor(private readonly tokens: TokenService) {}

    async fetch(audience: string): Promise<IssuedServiceToken> {
        const { token, expiresInSeconds } = await this.tokens.signServiceToken('auth', audience);
        return { token, expiresAt: Date.now() + expiresInSeconds * 1000 };
    }
}
