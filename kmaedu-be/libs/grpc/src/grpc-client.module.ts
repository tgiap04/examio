import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule, GrpcOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { PROTO_LOADER_OPTIONS, resolveProtoRoot } from './proto-paths';

/** Max gRPC message for file payloads (kept from the pre-buf R2 wiring). */
export const LARGE_MESSAGE_BYTES = 500 * 1024 * 1024;

export interface GrpcClientRegistration {
    /** Injection token for the `ClientGrpc` (e.g. `R2_GRPC`). */
    name: string;
    /** Proto package, e.g. `kmaedu.r2.v1`. */
    pkg: string;
    /** Proto file(s) relative to the proto root, e.g. `kmaedu/r2/v1/r2.proto`. */
    protoFile: string | string[];
    /** Env var holding `host:port`, e.g. `R2_GRPC_URL`. */
    urlEnv: string;
    maxMessageBytes?: number;
}

/**
 * Unset env is only tolerated outside production (clients connect lazily, so
 * boot-only environments such as CI health e2e keep working).
 */
const NON_PROD_FALLBACK_URL = 'localhost:50051';

export interface GrpcProtoRef {
    pkg: string;
    file: string;
}

@Module({})
export class GrpcClientModule {
    static register(...registrations: GrpcClientRegistration[]): DynamicModule {
        const root = resolveProtoRoot();
        return {
            module: GrpcClientModule,
            imports: [
                ClientsModule.register(
                    registrations.map((r) => {
                        const url =
                            process.env[r.urlEnv] ||
                            (process.env.NODE_ENV === 'production'
                                ? undefined
                                : NON_PROD_FALLBACK_URL);
                        if (!url) {
                            throw new Error(
                                `${r.urlEnv} is required to reach ${r.pkg}`
                            );
                        }
                        return {
                            name: r.name,
                            transport: Transport.GRPC as const,
                            options: {
                                package: r.pkg,
                                protoPath: [r.protoFile]
                                    .flat()
                                    .map((file) => join(root, file)),
                                url,
                                loader: {
                                    ...PROTO_LOADER_OPTIONS,
                                    includeDirs: [root],
                                },
                                ...(r.maxMessageBytes && {
                                    maxReceiveMessageLength: r.maxMessageBytes,
                                    maxSendMessageLength: r.maxMessageBytes,
                                }),
                            },
                        };
                    })
                ),
            ],
            exports: [ClientsModule],
        };
    }
}

/** `connectMicroservice` options for a gRPC server binding 0.0.0.0:${GRPC_PORT:-50051}. */
export function grpcServerOptions(
    protos: GrpcProtoRef[],
    maxMessageBytes?: number
): GrpcOptions {
    const root = resolveProtoRoot();
    return {
        transport: Transport.GRPC,
        options: {
            package: [...new Set(protos.map((p) => p.pkg))],
            protoPath: protos.map((p) => join(root, p.file)),
            url: `0.0.0.0:${process.env.GRPC_PORT || '50051'}`,
            loader: { ...PROTO_LOADER_OPTIONS, includeDirs: [root] },
            ...(maxMessageBytes && {
                maxReceiveMessageLength: maxMessageBytes,
                maxSendMessageLength: maxMessageBytes,
            }),
        },
    };
}
