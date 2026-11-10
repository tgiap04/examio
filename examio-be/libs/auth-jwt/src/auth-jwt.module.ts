import {
    DynamicModule,
    Module,
    type FactoryProvider,
    type ModuleMetadata,
    type Provider,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServiceMetadata } from './grpc-metadata';
import { JwtAuthGuard, TOKEN_VERIFIER } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import {
    HttpServiceTokenSource,
    ServiceTokenClient,
    type ServiceTokenSource,
} from './service-token.client';
import { createTokenVerifier, type TokenVerifier } from './verify';

export const SERVICE_TOKEN_SOURCE = Symbol('AUTH_JWT_SERVICE_TOKEN_SOURCE');

export interface AsyncFactory<T> {
    imports?: ModuleMetadata['imports'];
    inject?: FactoryProvider['inject'];
    useFactory: (...args: never[]) => T | Promise<T>;
}

export interface AuthJwtModuleOptions {
    /** This service's name: an accepted `aud` and the `client_id` for service tokens. */
    serviceName: string;
    /** Register `JwtAuthGuard` then `PermissionsGuard` as APP_GUARDs (default true). */
    globalGuards?: boolean;
    /** Override the verifier (auth verifies against its own keys, never over HTTP). */
    verifier?: AsyncFactory<TokenVerifier>;
    /**
     * `true`: fetch service tokens from auth with `SERVICE_CLIENT_SECRET` and
     * `AUTH_TOKEN_URL` (fails fast at boot when either is missing).
     * `{ source }`: custom source (auth signs its own tokens locally).
     */
    serviceClient?: boolean | { source: AsyncFactory<ServiceTokenSource> };
}

const isProduction = () => process.env.NODE_ENV === 'production';

function envOrDefault(name: string, fallback: string): string {
    const value = process.env[name];
    if (value) return value;
    if (isProduction()) throw new Error(`${name} is required`);
    return fallback;
}

function requiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
}

export function issuerFromEnv(): string {
    return envOrDefault('JWT_ISSUER', 'examio-auth');
}

export function audienceFromEnv(): string {
    return envOrDefault('JWT_AUDIENCE', 'examio');
}

function envVerifier(serviceName: string): TokenVerifier {
    return createTokenVerifier({
        jwksUrl: envOrDefault(
            'AUTH_JWKS_URL',
            'http://localhost:3000/.well-known/jwks.json'
        ),
        issuer: issuerFromEnv(),
        audiences: [audienceFromEnv(), serviceName],
    });
}

/**
 * Stateless authn/authz for every service: global deny-by-default guards,
 * a JWKS-backed verifier and (for callers) a service-token client. Global, so
 * feature modules never import it again.
 */
@Module({})
export class AuthJwtModule {
    static forRoot(options: AuthJwtModuleOptions): DynamicModule {
        const providers: Provider[] = [
            options.verifier
                ? {
                      provide: TOKEN_VERIFIER,
                      useFactory: options.verifier.useFactory,
                      inject: options.verifier.inject,
                  }
                : {
                      provide: TOKEN_VERIFIER,
                      useFactory: () => envVerifier(options.serviceName),
                  },
            JwtAuthGuard,
            PermissionsGuard,
        ];
        const imports: NonNullable<ModuleMetadata['imports']> = [
            ...(options.verifier?.imports ?? []),
        ];
        const exported: Array<symbol | (new (...a: never[]) => object)> = [
            TOKEN_VERIFIER,
            JwtAuthGuard,
            PermissionsGuard,
        ];

        if (options.globalGuards !== false) {
            providers.push(
                { provide: APP_GUARD, useClass: JwtAuthGuard },
                { provide: APP_GUARD, useClass: PermissionsGuard }
            );
        }

        const client = options.serviceClient;
        if (client) {
            const source =
                client === true
                    ? {
                          provide: SERVICE_TOKEN_SOURCE,
                          useFactory: (): ServiceTokenSource =>
                              new HttpServiceTokenSource({
                                  tokenUrl: requiredEnv('AUTH_TOKEN_URL'),
                                  serviceName: options.serviceName,
                                  clientSecret: requiredEnv('SERVICE_CLIENT_SECRET'),
                              }),
                      }
                    : {
                          provide: SERVICE_TOKEN_SOURCE,
                          useFactory: client.source.useFactory,
                          inject: client.source.inject,
                      };
            if (client !== true) imports.push(...(client.source.imports ?? []));
            providers.push(source, {
                provide: ServiceTokenClient,
                useFactory: (s: ServiceTokenSource) => new ServiceTokenClient(s),
                inject: [SERVICE_TOKEN_SOURCE],
            }, ServiceMetadata);
            exported.push(ServiceTokenClient, ServiceMetadata);
        }

        return {
            module: AuthJwtModule,
            global: true,
            imports,
            providers,
            exports: exported,
        };
    }
}
