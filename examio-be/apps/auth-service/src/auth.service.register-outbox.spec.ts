import { InternalServerErrorException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * `auth.user.registered` is written to the outbox inside the same transaction
 * as the user row, on both the email and the Google OAuth creation paths.
 */
describe('AuthService registration outbox', () => {
    const user = {
        id: 'user-1',
        email: 'new@example.com',
        username: 'newbie',
        utmSource: 'fb',
    };
    let tx: {
        user: { create: jest.Mock };
        userSubscription: { create: jest.Mock };
    };
    let prisma: { $transaction: jest.Mock };
    let outbox: { add: jest.Mock };
    let mail: { sendMail: jest.Mock };
    let userRepository: {
        emailExists: jest.Mock;
        usernameExists: jest.Mock;
        findByEmail: jest.Mock;
    };
    let service: AuthService;

    beforeEach(() => {
        tx = {
            user: { create: jest.fn().mockResolvedValue(user) },
            userSubscription: { create: jest.fn().mockResolvedValue({}) },
        };
        prisma = {
            $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
        };
        outbox = { add: jest.fn().mockResolvedValue({}) };
        mail = { sendMail: jest.fn().mockResolvedValue(undefined) };
        userRepository = {
            emailExists: jest.fn().mockResolvedValue(false),
            usernameExists: jest.fn().mockResolvedValue(false),
            findByEmail: jest.fn().mockResolvedValue(null),
        };
        service = new AuthService(
            prisma as never,
            userRepository as never,
            {} as never,
            { sign: jest.fn().mockReturnValue('jwt') } as never,
            mail as never,
            { hashPassword: jest.fn().mockResolvedValue('hash') } as never,
            { generateId: jest.fn().mockReturnValue('gen-id') } as never,
            outbox as never,
            {} as never
        );
    });

    it('register writes auth.user.registered inside the user transaction', async () => {
        await service.register({
            username: 'newbie',
            email: 'new@example.com',
            password: 'Passw0rd!',
            utmSource: 'fb',
        } as never);

        expect(outbox.add).toHaveBeenCalledTimes(1);
        expect(outbox.add).toHaveBeenCalledWith(tx, 'auth.user.registered', {
            userId: 'user-1',
            email: 'new@example.com',
            username: 'newbie',
            utmSource: 'fb',
        });
        // Same tx handle as the user insert, and added only after it.
        expect(tx.user.create.mock.invocationCallOrder[0]).toBeLessThan(
            outbox.add.mock.invocationCallOrder[0]
        );
    });

    it('register sends null utmSource when the signup has none', async () => {
        tx.user.create.mockResolvedValue({ ...user, utmSource: null });

        await service.register({
            username: 'newbie',
            email: 'new@example.com',
            password: 'Passw0rd!',
        } as never);

        expect(outbox.add.mock.calls[0][2].utmSource).toBeNull();
    });

    it('register fails (no welcome mail) when the outbox write fails, so the tx rolls back', async () => {
        outbox.add.mockRejectedValue(new Error('outbox insert failed'));

        await expect(
            service.register({
                username: 'newbie',
                email: 'new@example.com',
                password: 'Passw0rd!',
            } as never)
        ).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('Google OAuth creation writes auth.user.registered in the same tx', async () => {
        await (service as any).handleOAuthLogin('new@example.com', 'newbie', undefined, undefined, 'fb');

        expect(outbox.add).toHaveBeenCalledWith(tx, 'auth.user.registered', {
            userId: 'user-1',
            email: 'new@example.com',
            username: 'newbie',
            utmSource: 'fb',
        });
    });

    it('OAuth login of an existing user writes no event', async () => {
        userRepository.findByEmail.mockResolvedValue(user);

        await (service as any).handleOAuthLogin('new@example.com', 'newbie');

        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(outbox.add).not.toHaveBeenCalled();
    });
});
