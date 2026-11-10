import { Test } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import type { ClientGrpc } from '@nestjs/microservices';
import { ServiceMetadata } from '@kmaedu/auth-jwt';
import {
    GATEWAY_GRPC,
    GatewayControlClient,
    sessionRevokeExp,
} from './gateway-control.client';

function setup(enabled = true) {
    process.env.GATEWAY_CONTROL_ENABLED = enabled ? 'true' : 'false';
    const control = {
        revokeSession: jest.fn(() => of({})),
        invalidateUser: jest.fn(() => of({})),
    };
    const grpc = { getService: jest.fn(() => control) } as unknown as ClientGrpc;
    const metadata = { asService: jest.fn().mockResolvedValue({ marker: 'svc-md' }) };
    const client = new GatewayControlClient(grpc, metadata as unknown as ServiceMetadata);
    client.onModuleInit();
    return { client, control, metadata };
}

afterEach(() => {
    delete process.env.GATEWAY_CONTROL_ENABLED;
    delete process.env.ACCESS_TOKEN_EXPIRATION;
});

describe('GatewayControlClient.revokeSession', () => {
    it('sends sid and exp as a service token for the gateway', async () => {
        const { client, control, metadata } = setup();
        await client.revokeSession('sid-1', 1_900_000_000);
        expect(metadata.asService).toHaveBeenCalledWith('gateway');
        expect(control.revokeSession).toHaveBeenCalledWith(
            { sid: 'sid-1', exp: '1900000000' },
            { marker: 'svc-md' },
            expect.objectContaining({ deadline: expect.any(Number) })
        );
    });

    it('is a no-op while GATEWAY_CONTROL_ENABLED is off', async () => {
        const { client, control } = setup(false);
        await client.revokeSession('sid-1', 1_900_000_000);
        expect(control.revokeSession).not.toHaveBeenCalled();
    });

    it('never throws: a failed call is counted (the durable av event does not cover sessions, logout still succeeds)', async () => {
        const { client, control } = setup();
        control.revokeSession.mockReturnValueOnce(throwError(() => new Error('UNAVAILABLE')) as never);
        await expect(client.revokeSession('sid-1', 1)).resolves.toBeUndefined();
        expect(client.failureCount).toBe(1);
    });
});

describe('sessionRevokeExp', () => {
    it('covers the longest-lived token of the session (access TTL + 60 s skew)', () => {
        expect(sessionRevokeExp(1_000_000)).toBe(1_000 + 900 + 60);
        process.env.ACCESS_TOKEN_EXPIRATION = '30m';
        expect(sessionRevokeExp(1_000_000)).toBe(1_000 + 1800 + 60);
    });
});

describe('GatewayControlClient dependency injection', () => {
    it('Nest injects the ServiceMetadata and the gRPC client (a union-typed @Optional() param would silently get nothing)', async () => {
        process.env.GATEWAY_CONTROL_ENABLED = 'true';
        const control = { revokeSession: jest.fn(() => of({})), invalidateUser: jest.fn(() => of({})) };
        const metadata = { asService: jest.fn().mockResolvedValue({ marker: 'svc-md' }) };
        const moduleRef = await Test.createTestingModule({
            providers: [
                GatewayControlClient,
                { provide: ServiceMetadata, useValue: metadata },
                { provide: GATEWAY_GRPC, useValue: { getService: () => control } },
            ],
        }).compile();
        const client = moduleRef.get(GatewayControlClient);
        client.onModuleInit();

        await client.invalidateUser('u1', 3);

        expect(metadata.asService).toHaveBeenCalledWith('gateway');
        expect(control.invalidateUser).toHaveBeenCalledTimes(1);
        expect(client.failureCount).toBe(0);
    });
});
