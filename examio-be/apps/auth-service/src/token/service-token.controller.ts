import {
    BadRequestException,
    Body,
    Controller,
    HttpCode,
    Logger,
    Post,
    UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '@examio/auth-jwt';
import { parseServiceClients, SERVICE_AUDIENCES, type ServiceClients } from './service-clients';
import { TokenService } from './token.service';

const bodySchema = z
    .object({
        client_id: z.string().min(1).max(64),
        client_secret: z.string().min(1).max(256),
        audience: z.string().min(1).max(64),
    })
    .strict();

/**
 * `POST /internal/token` (client_credentials). Reachable only on the internal
 * network: the gateway never routes it and it sits outside `api/v1`.
 */
@ApiExcludeController()
@Controller('internal')
export class ServiceTokenController {
    private readonly logger = new Logger(ServiceTokenController.name);
    private readonly clients: ServiceClients = parseServiceClients(
        process.env.SERVICE_CLIENTS
    );

    constructor(private readonly tokens: TokenService) {}

    @Public()
    @Post('token')
    @HttpCode(200)
    async issue(@Body() body: unknown) {
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) throw new BadRequestException('Invalid token request');
        const { client_id: clientId, client_secret: secret, audience } = parsed.data;

        const authenticated = this.clients.authenticate(clientId, secret);
        if (!authenticated || !SERVICE_AUDIENCES.has(audience)) {
            // No detail to the caller; operators get the (bounded) client id.
            this.logger.warn(
                `Service token request rejected for client ${JSON.stringify(clientId.slice(0, 64))}`
            );
            throw new UnauthorizedException('Invalid client credentials');
        }

        const { token, expiresInSeconds } = await this.tokens.signServiceToken(
            clientId,
            audience
        );
        return {
            access_token: token,
            token_type: 'Bearer',
            expires_in: expiresInSeconds,
        };
    }
}
