import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma';
import { RedisService } from '@examio/redis';
import { WalletRepository } from './wallet.repository';

describe('WalletRepository - Atomic Balance Operations', () => {
  let repository: WalletRepository;
  let prismaService: PrismaService;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletRepository,
        {
          provide: PrismaService,
          useValue: {
            wallet: {
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              findUniqueOrThrow: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            delPattern: jest.fn(),
          },
        },
      ],
    }).compile();

    repository = module.get<WalletRepository>(WalletRepository);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('applyBalanceDelta - ADD Operation', () => {
    it('should successfully add balance using atomic increment', async () => {
      const userId = 'user-123';
      const amount = 100;
      const walletId = 'wallet-456';

      const initialWallet = {
        id: walletId,
        userId,
        balance: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      const updatedWallet = {
        ...initialWallet,
        balance: 600,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(initialWallet);

      jest
        .spyOn(prismaService.wallet, 'update')
        .mockResolvedValue(updatedWallet);

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delPattern').mockResolvedValue(undefined);

      const result = await repository.applyBalanceDelta(userId, amount, 'add');

      expect(result.balance).toBe(600);

      // Verify atomic increment was used
      expect(prismaService.wallet.update).toHaveBeenCalledWith({
        where: { id: walletId },
        data: {
          balance: { increment: amount },
          updatedBy: userId,
        },
      });

      // Verify cache was invalidated
      expect(redisService.del).toHaveBeenCalled();
    });

    it('should handle adding zero credits (edge case)', async () => {
      const userId = 'user-456';
      const amount = 0;
      const walletId = 'wallet-789';

      const wallet = {
        id: walletId,
        userId,
        balance: 250,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(wallet);

      jest
        .spyOn(prismaService.wallet, 'update')
        .mockResolvedValue(wallet); // No change

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delPattern').mockResolvedValue(undefined);

      const result = await repository.applyBalanceDelta(userId, amount, 'add');

      expect(result.balance).toBe(250); // Unchanged
      expect(prismaService.wallet.update).toHaveBeenCalledWith({
        where: { id: walletId },
        data: {
          balance: { increment: 0 },
          updatedBy: userId,
        },
      });
    });

    it('should throw error when wallet not found for ADD', async () => {
      jest.spyOn(prismaService.wallet, 'findUnique').mockResolvedValue(null);

      await expect(
        repository.applyBalanceDelta('user-nonexistent', 100, 'add')
      ).rejects.toThrow('Wallet not found');
    });
  });

  describe('applyBalanceDelta - SUBTRACT Operation (Insufficient Balance Guard)', () => {
    it('should successfully subtract balance when sufficient funds exist', async () => {
      const userId = 'user-789';
      const amount = 150;
      const walletId = 'wallet-001';

      const initialWallet = {
        id: walletId,
        userId,
        balance: 500, // Sufficient
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      const updatedWallet = {
        ...initialWallet,
        balance: 350,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(initialWallet);

      jest
        .spyOn(prismaService.wallet, 'updateMany')
        .mockResolvedValue({ count: 1 }); // Guard passed

      jest
        .spyOn(prismaService.wallet, 'findUniqueOrThrow')
        .mockResolvedValue(updatedWallet);

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delPattern').mockResolvedValue(undefined);

      const result = await repository.applyBalanceDelta(userId, amount, 'subtract');

      expect(result.balance).toBe(350);

      // Verify the conditional guard was used: balance >= amount
      expect(prismaService.wallet.updateMany).toHaveBeenCalledWith({
        where: {
          id: walletId,
          balance: { gte: amount }, // CRITICAL: Guard prevents overdraw
        },
        data: {
          balance: { decrement: amount },
          updatedBy: userId,
        },
      });
    });

    it('should throw "Insufficient balance" when balance is too low', async () => {
      const userId = 'user-999';
      const amount = 500; // Try to subtract 500
      const walletId = 'wallet-002';

      const wallet = {
        id: walletId,
        userId,
        balance: 100, // INSUFFICIENT
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(wallet);

      jest
        .spyOn(prismaService.wallet, 'updateMany')
        .mockResolvedValue({ count: 0 }); // Guard failed: balance < amount

      await expect(
        repository.applyBalanceDelta(userId, amount, 'subtract')
      ).rejects.toThrow('Insufficient balance');

      // Verify the guard was checked
      expect(prismaService.wallet.updateMany).toHaveBeenCalledWith({
        where: {
          id: walletId,
          balance: { gte: amount },
        },
        data: {
          balance: { decrement: amount },
          updatedBy: userId,
        },
      });
    });

    it('should throw error when balance equals exactly zero and trying to subtract', async () => {
      const userId = 'user-111';
      const amount = 1;
      const walletId = 'wallet-003';

      const wallet = {
        id: walletId,
        userId,
        balance: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(wallet);

      jest
        .spyOn(prismaService.wallet, 'updateMany')
        .mockResolvedValue({ count: 0 }); // Guard: 0 < 1

      await expect(
        repository.applyBalanceDelta(userId, amount, 'subtract')
      ).rejects.toThrow('Insufficient balance');
    });

    it('should throw error when balance is just below amount', async () => {
      const userId = 'user-222';
      const amount = 100;
      const walletId = 'wallet-004';

      const wallet = {
        id: walletId,
        userId,
        balance: 99, // Just below amount
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(wallet);

      jest
        .spyOn(prismaService.wallet, 'updateMany')
        .mockResolvedValue({ count: 0 }); // Guard: 99 < 100

      await expect(
        repository.applyBalanceDelta(userId, amount, 'subtract')
      ).rejects.toThrow('Insufficient balance');
    });

    it('should throw error when balance is just at the boundary (not sufficient)', async () => {
      const userId = 'user-333';
      const amount = 100;
      const walletId = 'wallet-005';

      const wallet = {
        id: walletId,
        userId,
        balance: 100, // Exactly equals amount - SHOULD SUCCEED
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      const updatedWallet = {
        ...wallet,
        balance: 0,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(wallet);

      jest
        .spyOn(prismaService.wallet, 'updateMany')
        .mockResolvedValue({ count: 1 }); // Guard: 100 >= 100 PASSES

      jest
        .spyOn(prismaService.wallet, 'findUniqueOrThrow')
        .mockResolvedValue(updatedWallet);

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delPattern').mockResolvedValue(undefined);

      const result = await repository.applyBalanceDelta(userId, amount, 'subtract');

      expect(result.balance).toBe(0); // Successfully decremented to 0
    });

    it('should not throw when subtracting large amount from large balance', async () => {
      const userId = 'user-444';
      const amount = 5000;
      const walletId = 'wallet-006';

      const initialWallet = {
        id: walletId,
        userId,
        balance: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      const updatedWallet = {
        ...initialWallet,
        balance: 5000,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(initialWallet);

      jest
        .spyOn(prismaService.wallet, 'updateMany')
        .mockResolvedValue({ count: 1 });

      jest
        .spyOn(prismaService.wallet, 'findUniqueOrThrow')
        .mockResolvedValue(updatedWallet);

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delPattern').mockResolvedValue(undefined);

      const result = await repository.applyBalanceDelta(userId, amount, 'subtract');

      expect(result.balance).toBe(5000);
    });
  });

  describe('applyBalanceDelta - Atomicity & Concurrency', () => {
    it('should use atomic increment to prevent lost updates in concurrent ADD', async () => {
      const userId = 'user-555';
      const amount = 50;
      const walletId = 'wallet-007';

      const wallet = {
        id: walletId,
        userId,
        balance: 200,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(wallet);

      jest
        .spyOn(prismaService.wallet, 'update')
        .mockResolvedValue({ ...wallet, balance: 250 });

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delPattern').mockResolvedValue(undefined);

      await repository.applyBalanceDelta(userId, amount, 'add');

      // Atomic increment prevents lost updates even with concurrent writes
      expect(prismaService.wallet.update).toHaveBeenCalledWith({
        where: { id: walletId },
        data: {
          balance: { increment: amount },
          updatedBy: userId,
        },
      });
    });

    it('should use atomic decrement with conditional guard to prevent overdraw in concurrent SUBTRACT', async () => {
      const userId = 'user-666';
      const amount = 75;
      const walletId = 'wallet-008';

      const wallet = {
        id: walletId,
        userId,
        balance: 300,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(wallet);

      jest
        .spyOn(prismaService.wallet, 'updateMany')
        .mockResolvedValue({ count: 1 });

      jest
        .spyOn(prismaService.wallet, 'findUniqueOrThrow')
        .mockResolvedValue({ ...wallet, balance: 225 });

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delPattern').mockResolvedValue(undefined);

      await repository.applyBalanceDelta(userId, amount, 'subtract');

      // The conditional guard ensures atomicity: if concurrent write reduces balance
      // below the requirement, this decrement will not execute (count=0)
      expect(prismaService.wallet.updateMany).toHaveBeenCalledWith({
        where: {
          id: walletId,
          balance: { gte: amount },
        },
        data: {
          balance: { decrement: amount },
          updatedBy: userId,
        },
      });
    });

    it('should detect race condition in SUBTRACT when balance drops below amount', async () => {
      const userId = 'user-777';
      const amount = 200;
      const walletId = 'wallet-009';

      // Scenario: concurrent write reduces balance between findUnique and updateMany
      const wallet = {
        id: walletId,
        userId,
        balance: 300, // Found: sufficient
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(wallet);

      // Another thread reduces balance to 150 before this updateMany executes
      jest
        .spyOn(prismaService.wallet, 'updateMany')
        .mockResolvedValue({ count: 0 }); // Guard caught it: 150 < 200

      await expect(
        repository.applyBalanceDelta(userId, amount, 'subtract')
      ).rejects.toThrow('Insufficient balance');

      // Race condition was prevented by the guard
      expect(prismaService.wallet.updateMany).toHaveBeenCalledWith({
        where: {
          id: walletId,
          balance: { gte: amount },
        },
        data: {
          balance: { decrement: amount },
          updatedBy: userId,
        },
      });
    });
  });

  describe('applyBalanceDelta - Cache Invalidation', () => {
    it('should invalidate user wallet cache after ADD operation', async () => {
      const userId = 'user-888';
      const walletId = 'wallet-010';

      const wallet = {
        id: walletId,
        userId,
        balance: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(wallet);

      jest
        .spyOn(prismaService.wallet, 'update')
        .mockResolvedValue({ ...wallet, balance: 150 });

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delPattern').mockResolvedValue(undefined);

      await repository.applyBalanceDelta(userId, 50, 'add');

      // Verify cache was invalidated
      expect(redisService.del).toHaveBeenCalled();
    });

    it('should invalidate user wallet cache after SUBTRACT operation', async () => {
      const userId = 'user-999';
      const walletId = 'wallet-011';

      const wallet = {
        id: walletId,
        userId,
        balance: 200,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(wallet);

      jest
        .spyOn(prismaService.wallet, 'updateMany')
        .mockResolvedValue({ count: 1 });

      jest
        .spyOn(prismaService.wallet, 'findUniqueOrThrow')
        .mockResolvedValue({ ...wallet, balance: 50 });

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delPattern').mockResolvedValue(undefined);

      await repository.applyBalanceDelta(userId, 150, 'subtract');

      // Verify cache was invalidated
      expect(redisService.del).toHaveBeenCalled();
    });
  });

  describe('applyBalanceDelta - Error Handling', () => {
    it('should throw error when wallet not found for SUBTRACT', async () => {
      jest.spyOn(prismaService.wallet, 'findUnique').mockResolvedValue(null);

      await expect(
        repository.applyBalanceDelta('user-nonexistent', 100, 'subtract')
      ).rejects.toThrow('Wallet not found');
    });

    it('should handle very small amount subtraction', async () => {
      const userId = 'user-aaa';
      const amount = 0.01; // 0.01 credits
      const walletId = 'wallet-012';

      const wallet = {
        id: walletId,
        userId,
        balance: 1.5,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(wallet);

      jest
        .spyOn(prismaService.wallet, 'updateMany')
        .mockResolvedValue({ count: 1 });

      jest
        .spyOn(prismaService.wallet, 'findUniqueOrThrow')
        .mockResolvedValue({ ...wallet, balance: 1.49 });

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delPattern').mockResolvedValue(undefined);

      const result = await repository.applyBalanceDelta(userId, amount, 'subtract');

      expect(result.balance).toBeCloseTo(1.49, 2);
    });

    it('should handle very large amount addition', async () => {
      const userId = 'user-bbb';
      const amount = 1000000; // 1M credits
      const walletId = 'wallet-013';

      const wallet = {
        id: walletId,
        userId,
        balance: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(wallet);

      jest
        .spyOn(prismaService.wallet, 'update')
        .mockResolvedValue({ ...wallet, balance: 1000000 });

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delPattern').mockResolvedValue(undefined);

      const result = await repository.applyBalanceDelta(userId, amount, 'add');

      expect(result.balance).toBe(1000000);
    });
  });

  describe('applyBalanceDelta - Default Operation', () => {
    it('should default to ADD operation when operation parameter not specified', async () => {
      const userId = 'user-ccc';
      const amount = 100;
      const walletId = 'wallet-014';

      const wallet = {
        id: walletId,
        userId,
        balance: 200,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(wallet);

      jest
        .spyOn(prismaService.wallet, 'update')
        .mockResolvedValue({ ...wallet, balance: 300 });

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delPattern').mockResolvedValue(undefined);

      // Call without operation parameter - should default to 'add'
      const result = await repository.applyBalanceDelta(userId, amount);

      expect(result.balance).toBe(300);
      expect(prismaService.wallet.update).toHaveBeenCalledWith({
        where: { id: walletId },
        data: {
          balance: { increment: amount },
          updatedBy: userId,
        },
      });
    });
  });
});
