import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AuthJwtModule } from './auth-jwt.module';
import { ServiceMetadata } from './grpc-metadata';
import { JwtAuthGuard, TOKEN_VERIFIER } from './jwt-auth.guard';
import { ServiceTokenClient } from './service-token.client';

describe('AuthJwtModule.forRoot', () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
    });

    it('wires verifier + guards (no service client unless asked)', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AuthJwtModule.forRoot({ serviceName: 'r2' })],
        }).compile();
        expect(moduleRef.get(TOKEN_VERIFIER)).toBeInstanceOf(Function);
        expect(moduleRef.get(JwtAuthGuard)).toBeDefined();
        expect(() => moduleRef.get(ServiceMetadata)).toThrow();
    });

    it('serviceClient:true builds ServiceTokenClient + ServiceMetadata from env', async () => {
        process.env.AUTH_TOKEN_URL = 'http://auth/internal/token';
        process.env.SERVICE_CLIENT_SECRET = 's3cret';
        const moduleRef = await Test.createTestingModule({
            imports: [AuthJwtModule.forRoot({ serviceName: 'exam', serviceClient: true })],
        }).compile();
        expect(moduleRef.get(ServiceTokenClient)).toBeInstanceOf(ServiceTokenClient);
        expect(moduleRef.get(ServiceMetadata)).toBeInstanceOf(ServiceMetadata);
    });

    it('serviceClient:true fails fast when AUTH_TOKEN_URL or SERVICE_CLIENT_SECRET is missing', async () => {
        delete process.env.AUTH_TOKEN_URL;
        delete process.env.SERVICE_CLIENT_SECRET;
        await expect(
            Test.createTestingModule({
                imports: [AuthJwtModule.forRoot({ serviceName: 'exam', serviceClient: true })],
            }).compile()
        ).rejects.toThrow(/AUTH_TOKEN_URL|SERVICE_CLIENT_SECRET/);
    });

    it('registers both guards as APP_GUARD by default and none when globalGuards:false', () => {
        const count = (opts: { globalGuards?: boolean }) =>
            (AuthJwtModule.forRoot({ serviceName: 'x', ...opts }).providers ?? []).filter(
                (p) => (p as { provide?: unknown }).provide === APP_GUARD
            ).length;
        expect(count({})).toBe(2);
        expect(count({ globalGuards: false })).toBe(0);
    });

    it('production requires JWT_ISSUER, JWT_AUDIENCE and AUTH_JWKS_URL', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.JWT_ISSUER;
        await expect(
            Test.createTestingModule({ imports: [AuthJwtModule.forRoot({ serviceName: 'r2' })] }).compile()
        ).rejects.toThrow(/AUTH_JWKS_URL|JWT_ISSUER|JWT_AUDIENCE/);
    });
});
