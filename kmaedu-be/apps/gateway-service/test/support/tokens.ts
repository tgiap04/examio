import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import {
    createTestKeyPair,
    serviceClaims,
    signTestToken,
    type TestKeyPair,
} from '@kmaedu/auth-jwt/testing';

export const RUN = Math.random().toString(36).slice(2, 8);

/** Serves the JWKS the gateway verifies against and mints tokens with its key. */
export class TokenIssuer {
    private server!: Server;
    private keys!: TestKeyPair;
    jwksUrl = '';

    async start(): Promise<this> {
        this.keys = await createTestKeyPair('e2e-kid');
        this.server = createServer((_req, res) =>
            res
                .writeHead(200, { 'content-type': 'application/json' })
                .end(JSON.stringify({ keys: [this.keys.publicJwk] }))
        );
        await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
        this.jwksUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/.well-known/jwks.json`;
        return this;
    }

    user(
        name: string,
        roles: string[] = ['STUDENT'],
        extra: { av?: number; sid?: string; emailVerified?: boolean; expiresInSeconds?: number } = {}
    ): Promise<string> {
        return signTestToken(this.keys, {
            expiresInSeconds: extra.expiresInSeconds,
            claims: {
                sub: `${name}-${RUN}`,
                sid: extra.sid ?? `sid-${name}-${RUN}`,
                roles,
                av: extra.av ?? 0,
                email_verified: extra.emailVerified ?? true,
            },
        });
    }

    service(name: string, audience = 'gateway'): Promise<string> {
        return signTestToken(this.keys, { claims: serviceClaims(name), audience });
    }

    async stop(): Promise<void> {
        this.server.closeAllConnections();
        await new Promise((resolve) => this.server.close(resolve));
    }
}

export const subjectOf = (name: string): string => `${name}-${RUN}`;
export const sidOf = (name: string): string => `sid-${name}-${RUN}`;
