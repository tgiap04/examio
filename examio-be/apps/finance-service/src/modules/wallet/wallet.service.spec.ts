import { NotFoundException } from '@nestjs/common';
import { WalletService } from './wallet.service';

const teacher = { kind: 'user', id: 'u1', sid: 's', roles: ['TEACHER'], emailVerified: true, av: 1 } as const;
const student = { ...teacher, roles: ['STUDENT'] } as never;

function setup(existing: unknown) {
    const repo = {
        findByUserId: jest
            .fn()
            .mockResolvedValueOnce(existing)
            .mockResolvedValue({ id: 'w1', userId: 'u1', balance: 20 }),
    };
    const ensure = { ensure: jest.fn().mockResolvedValue({ created: true }) };
    const service = new WalletService(repo as never, {} as never, {} as never, ensure as never);
    return { service, repo, ensure };
}

describe('WalletService lazy ensureWallet (GET /wallet/info)', () => {
    it('a TEACHER without a wallet gets one provisioned (balance 20) instead of a 404', async () => {
        const { service, ensure, repo } = setup(null);
        await expect(service.getWallet(teacher as never)).resolves.toMatchObject({ balance: 20 });
        expect(ensure.ensure).toHaveBeenCalledWith('u1');
        expect(repo.findByUserId).toHaveBeenLastCalledWith('u1', false);
    });

    it('a user without wallet:use still gets 404 and nothing is provisioned', async () => {
        const { service, ensure } = setup(null);
        await expect(service.getWallet(student)).rejects.toBeInstanceOf(NotFoundException);
        expect(ensure.ensure).not.toHaveBeenCalled();
    });

    it('an existing wallet is returned without ensuring', async () => {
        const { service, ensure } = setup({ id: 'w0', balance: 5 });
        await expect(service.getWallet(teacher as never)).resolves.toMatchObject({ balance: 5 });
        expect(ensure.ensure).not.toHaveBeenCalled();
    });
});
