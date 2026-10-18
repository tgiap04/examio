import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@examio/auth-jwt';
import { TokenService } from './token.service';

/** `GET /.well-known/jwks.json` (outside the `api/v1` prefix): verification keys only. */
@ApiExcludeController()
@Controller('.well-known')
export class JwksController {
    constructor(private readonly tokens: TokenService) {}

    @Public()
    @Get('jwks.json')
    @Header('Cache-Control', 'public, max-age=300')
    jwks() {
        return this.tokens.jwks();
    }
}
