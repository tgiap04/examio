import { Module } from '@nestjs/common';
import { JwksController } from './jwks.controller';
import { ServiceTokenController } from './service-token.controller';
import { TokenService } from './token.service';

@Module({
    controllers: [JwksController, ServiceTokenController],
    providers: [TokenService],
    exports: [TokenService],
})
export class TokenModule {}
