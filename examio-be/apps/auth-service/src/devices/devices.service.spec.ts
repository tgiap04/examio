import { DevicesService } from './devices.service';

const session = (id: string, sessionId: string, userId = 'u1') => ({ id, sessionId, userId });

function setup() {
    const repo = { findById: jest.fn(), findActiveSessionsByUserId: jest.fn() };
    const revoker = {
        revokeById: jest.fn().mockResolvedValue([]),
        revokeAllOthers: jest.fn().mockResolvedValue([]),
    };
    return { repo, revoker, service: new DevicesService(repo as never, revoker as never) };
}

describe('DevicesService session revocation (durable event + fast path via SessionRevoker)', () => {
    it('logoutDevice revokes exactly the targeted session row', async () => {
        const { service, repo, revoker } = setup();
        repo.findById.mockResolvedValue(session('row-2', 'sid-2'));
        await expect(service.logoutDevice('u1', 'row-2', 'sid-1')).resolves.toMatchObject({ success: true });
        expect(revoker.revokeById).toHaveBeenCalledWith('row-2');
    });

    it('logoutDevice refuses unknown, foreign and current sessions without revoking anything', async () => {
        const { service, repo, revoker } = setup();
        repo.findById.mockResolvedValue(null);
        await expect(service.logoutDevice('u1', 'x', 'sid-1')).rejects.toThrow();
        repo.findById.mockResolvedValue(session('row-9', 'sid-9', 'someone-else'));
        await expect(service.logoutDevice('u1', 'row-9', 'sid-1')).rejects.toThrow();
        repo.findById.mockResolvedValue(session('row-1', 'sid-1'));
        await expect(service.logoutDevice('u1', 'row-1', 'sid-1')).rejects.toThrow();
        expect(revoker.revokeById).not.toHaveBeenCalled();
    });

    it('logoutAllOthers reports how many sessions the revoker closed', async () => {
        const { service, revoker } = setup();
        revoker.revokeAllOthers.mockResolvedValue([session('r2', 'sid-2'), session('r3', 'sid-3')]);
        const result = await service.logoutAllOthers('u1', 'sid-1');
        expect(revoker.revokeAllOthers).toHaveBeenCalledWith('u1', 'sid-1');
        expect(result).toMatchObject({ success: true, devicesLoggedOut: 2 });
    });
});
