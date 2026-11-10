import 'reflect-metadata';
import { RpcException } from '@nestjs/microservices';
import { SERVICE_ONLY_KEY } from '@kmaedu/auth-jwt';
import { GatewayControlGrpcController } from './gateway-control.grpc.controller';

function setup() {
    const state = {
        revokeSession: jest.fn().mockResolvedValue(undefined),
        raiseAuthzVersion: jest.fn().mockResolvedValue(undefined),
    };
    const config = { setPages: jest.fn().mockResolvedValue(undefined) };
    return { state, config, controller: new GatewayControlGrpcController(state as never, config as never) };
}
const rpcCode = async (p: Promise<unknown>) =>
    p.then(() => 'ok', (e: RpcException) => (e.getError() as { code: number }).code);

describe('GatewayControlGrpcController', () => {
    it('every RPC is allowlisted per caller (auth: revoke/invalidate, admin: page flags)', () => {
        const callers = (name: keyof GatewayControlGrpcController) =>
            Reflect.getMetadata(SERVICE_ONLY_KEY, GatewayControlGrpcController.prototype[name]);
        expect(callers('revokeSession')).toEqual(['auth']);
        expect(callers('invalidateUser')).toEqual(['auth']);
        expect(callers('setPageFlags')).toEqual(['admin']);
    });

    it('revokeSession parses the int64 exp string', async () => {
        const { controller, state } = setup();
        await controller.revokeSession({ sid: 's1', exp: '1900000000' });
        expect(state.revokeSession).toHaveBeenCalledWith('s1', 1_900_000_000);
    });

    it('invalidateUser parses the int64 version string', async () => {
        const { controller, state } = setup();
        await controller.invalidateUser({ userId: 'u1', authzVersion: '7' });
        expect(state.raiseAuthzVersion).toHaveBeenCalledWith('u1', 7);
    });

    it.each([
        ['empty sid', () => ({ sid: '', exp: '1' })],
        ['negative exp', () => ({ sid: 's', exp: '-1' })],
        ['non-numeric exp', () => ({ sid: 's', exp: 'x' })],
        ['fractional exp', () => ({ sid: 's', exp: '1.5' })],
    ])('revokeSession rejects %s with INVALID_ARGUMENT', async (_n, input) => {
        const { controller, state } = setup();
        expect(await rpcCode(controller.revokeSession(input()))).toBe(3);
        expect(state.revokeSession).not.toHaveBeenCalled();
    });

    it('invalidateUser rejects an empty user id or a bad version', async () => {
        const { controller, state } = setup();
        expect(await rpcCode(controller.invalidateUser({ userId: '', authzVersion: '1' }))).toBe(3);
        expect(await rpcCode(controller.invalidateUser({ userId: 'u', authzVersion: '-2' }))).toBe(3);
        expect(state.raiseAuthzVersion).not.toHaveBeenCalled();
    });

    it('setPageFlags stores the full map', async () => {
        const { controller, config } = setup();
        await controller.setPageFlags({ flags: { 'ai-tool': false } });
        expect(config.setPages).toHaveBeenCalledWith({ 'ai-tool': false });
    });
});
