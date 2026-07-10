import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@examio/database';
import { GenerateIdService } from '@examio/common';
import { WalletGrpcController } from './wallet.grpc.controller';

describe('WalletGrpcController - Security Validation', () => {
  let controller: WalletGrpcController;
  let prismaService: PrismaService;
  let generateIdService: GenerateIdService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletGrpcController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            wallet: {
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              findUniqueOrThrow: jest.fn(),
            },
            walletTransaction: {
              create: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: GenerateIdService,
          useValue: {
            generateId: jest.fn().mockReturnValue('txn-id-12345'),
          },
        },
      ],
    }).compile();

    controller = module.get<WalletGrpcController>(WalletGrpcController);
    prismaService = module.get<PrismaService>(PrismaService);
    generateIdService = module.get<GenerateIdService>(GenerateIdService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('UpdateBalance - Input Validation', () => {
    it('should reject amount <= 0 with error message', async () => {
      const result = await controller.updateBalance({
        userId: 'user-123',
        amount: 0,
        transactionType: 'ADD',
        description: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('positive number');
    });

    it('should reject negative amount', async () => {
      const result = await controller.updateBalance({
        userId: 'user-123',
        amount: -100,
        transactionType: 'ADD',
        description: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('positive number');
    });

    it('should reject non-finite amounts', async () => {
      const result = await controller.updateBalance({
        userId: 'user-123',
        amount: Infinity,
        transactionType: 'ADD',
        description: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('positive number');
    });

    it('should reject NaN amounts', async () => {
      const result = await controller.updateBalance({
        userId: 'user-123',
        amount: NaN,
        transactionType: 'ADD',
        description: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('positive number');
    });
  });

  describe('UpdateBalance - ADD Operation', () => {
    it('should successfully add balance for valid ADD request', async () => {
      const userId = 'user-456';
      const amount = 100;
      const walletId = 'wallet-789';

      const mockWallet = {
        id: walletId,
        userId,
        balance: 500,
      };

      const updatedWallet = {
        ...mockWallet,
        balance: mockWallet.balance + amount,
      };

      const mockTx = {
        wallet: {
          update: jest.fn().mockResolvedValue(updatedWallet),
        },
        walletTransaction: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(mockWallet as any);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (cb) => cb(mockTx as any));

      const result = await controller.updateBalance({
        userId,
        amount,
        transactionType: 'ADD',
        description: 'buy credits',
      });

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(600); // 500 + 100
      expect(mockTx.wallet.update).toHaveBeenCalledWith({
        where: { id: walletId },
        data: { balance: { increment: amount } },
      });
    });

    it('should create wallet transaction record for ADD operation', async () => {
      const userId = 'user-456';
      const amount = 50;
      const walletId = 'wallet-789';

      const mockWallet = {
        id: walletId,
        userId,
        balance: 200,
      };

      const mockTx = {
        wallet: {
          update: jest.fn().mockResolvedValue({
            ...mockWallet,
            balance: 250,
          }),
        },
        walletTransaction: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(mockWallet as any);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (cb) => cb(mockTx as any));

      await controller.updateBalance({
        userId,
        amount,
        transactionType: 'ADD',
        description: 'subscription bonus',
      });

      expect(mockTx.walletTransaction.create).toHaveBeenCalledWith({
        data: {
          id: 'txn-id-12345',
          walletId,
          amount,
          type: 0,
          direction: 'ADD',
          description: 'subscription bonus',
        },
      });
    });

    it('should return error when wallet not found for ADD', async () => {
      jest.spyOn(prismaService.wallet, 'findUnique').mockResolvedValue(null);

      const result = await controller.updateBalance({
        userId: 'user-nonexistent',
        amount: 100,
        transactionType: 'ADD',
        description: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Wallet not found');
    });
  });

  describe('UpdateBalance - SUBTRACT Operation (Insufficient Balance Protection)', () => {
    it('should successfully subtract balance when sufficient funds available', async () => {
      const userId = 'user-789';
      const amount = 100;
      const walletId = 'wallet-001';

      const mockWallet = {
        id: walletId,
        userId,
        balance: 500, // Sufficient
      };

      const mockTx = {
        wallet: {
          updateMany: jest
            .fn()
            .mockResolvedValue({ count: 1 }), // Sufficient guard passed
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            ...mockWallet,
            balance: 400, // After decrement
          }),
        },
        walletTransaction: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(mockWallet as any);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (cb) => cb(mockTx as any));

      const result = await controller.updateBalance({
        userId,
        amount,
        transactionType: 'SUBTRACT',
        description: 'use service',
      });

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(400);

      // Verify the guard was used: balance >= amount
      expect(mockTx.wallet.updateMany).toHaveBeenCalledWith({
        where: {
          id: walletId,
          balance: { gte: amount }, // CRITICAL: Guard prevents overdraw
        },
        data: { balance: { decrement: amount } },
      });
    });

    it('should REJECT subtract when balance is insufficient (Guard Prevents Overdraw)', async () => {
      const userId = 'user-123';
      const amount = 500;
      const walletId = 'wallet-002';

      const mockWallet = {
        id: walletId,
        userId,
        balance: 100, // INSUFFICIENT
      };

      const mockTx = {
        wallet: {
          updateMany: jest
            .fn()
            .mockResolvedValue({ count: 0 }), // Guard: balance < amount, no update
        },
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(mockWallet as any);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (cb) => cb(mockTx as any));

      const result = await controller.updateBalance({
        userId,
        amount,
        transactionType: 'SUBTRACT',
        description: 'premium feature',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient balance');
      expect(result.new_balance).toBe(0);

      // Verify the guard was checked
      expect(mockTx.wallet.updateMany).toHaveBeenCalledWith({
        where: {
          id: walletId,
          balance: { gte: amount },
        },
        data: { balance: { decrement: amount } },
      });
    });

    it('should reject subtract when balance exactly equals zero', async () => {
      const userId = 'user-456';
      const amount = 1; // Try to subtract 1
      const walletId = 'wallet-003';

      const mockWallet = {
        id: walletId,
        userId,
        balance: 0, // Empty wallet
      };

      const mockTx = {
        wallet: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(mockWallet as any);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (cb) => cb(mockTx as any));

      const result = await controller.updateBalance({
        userId,
        amount,
        transactionType: 'SUBTRACT',
        description: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient balance');
    });

    it('should reject subtract when balance is just below amount', async () => {
      const userId = 'user-789';
      const amount = 100;
      const walletId = 'wallet-004';

      const mockWallet = {
        id: walletId,
        userId,
        balance: 99, // Just below amount
      };

      const mockTx = {
        wallet: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }), // Guard fails
        },
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(mockWallet as any);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (cb) => cb(mockTx as any));

      const result = await controller.updateBalance({
        userId,
        amount,
        transactionType: 'SUBTRACT',
        description: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient balance');
    });

    it('should create transaction record for SUBTRACT operation when successful', async () => {
      const userId = 'user-999';
      const amount = 50;
      const walletId = 'wallet-005';

      const mockWallet = {
        id: walletId,
        userId,
        balance: 200,
      };

      const mockTx = {
        wallet: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            ...mockWallet,
            balance: 150,
          }),
        },
        walletTransaction: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(mockWallet as any);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (cb) => cb(mockTx as any));

      await controller.updateBalance({
        userId,
        amount,
        transactionType: 'SUBTRACT',
        description: 'use credits',
      });

      expect(mockTx.walletTransaction.create).toHaveBeenCalledWith({
        data: {
          id: 'txn-id-12345',
          walletId,
          amount,
          type: 4, // Use services type
          direction: 'SUBTRACT',
          description: 'use credits',
        },
      });
    });

    it('should not create transaction record when SUBTRACT fails due to insufficient balance', async () => {
      const userId = 'user-321';
      const amount = 1000;
      const walletId = 'wallet-006';

      const mockWallet = {
        id: walletId,
        userId,
        balance: 100,
      };

      const mockTx = {
        wallet: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }), // Insufficient
        },
        walletTransaction: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(mockWallet as any);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (cb) => cb(mockTx as any));

      const result = await controller.updateBalance({
        userId,
        amount,
        transactionType: 'SUBTRACT',
        description: 'test',
      });

      expect(result.success).toBe(false);
      // Transaction record should NOT be created when insufficient
      expect(mockTx.walletTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('UpdateBalance - Atomicity & Concurrency', () => {
    it('should use atomic increment for ADD operation', async () => {
      const userId = 'user-111';
      const amount = 75;
      const walletId = 'wallet-111';

      const mockWallet = {
        id: walletId,
        userId,
        balance: 100,
      };

      const mockTx = {
        wallet: {
          update: jest.fn().mockResolvedValue({
            ...mockWallet,
            balance: 175,
          }),
        },
        walletTransaction: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(mockWallet as any);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (cb) => cb(mockTx as any));

      await controller.updateBalance({
        userId,
        amount,
        transactionType: 'ADD',
        description: 'test atomic',
      });

      // Verify atomic increment (prevents lost updates)
      expect(mockTx.wallet.update).toHaveBeenCalledWith({
        where: { id: walletId },
        data: { balance: { increment: amount } },
      });
    });

    it('should use atomic decrement with conditional guard for SUBTRACT operation', async () => {
      const userId = 'user-222';
      const amount = 60;
      const walletId = 'wallet-222';

      const mockWallet = {
        id: walletId,
        userId,
        balance: 300,
      };

      const mockTx = {
        wallet: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            ...mockWallet,
            balance: 240,
          }),
        },
        walletTransaction: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(mockWallet as any);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (cb) => cb(mockTx as any));

      await controller.updateBalance({
        userId,
        amount,
        transactionType: 'SUBTRACT',
        description: 'test atomic',
      });

      // Verify:
      // 1. Conditional guard prevents overdraw under concurrent writes
      // 2. Atomic decrement prevents lost updates
      expect(mockTx.wallet.updateMany).toHaveBeenCalledWith({
        where: {
          id: walletId,
          balance: { gte: amount }, // Guard
        },
        data: { balance: { decrement: amount } }, // Atomic
      });
    });

    it('should execute all wallet operations in a single transaction', async () => {
      const userId = 'user-333';
      const amount = 123;
      const walletId = 'wallet-333';

      const mockWallet = {
        id: walletId,
        userId,
        balance: 500,
      };

      const mockTx = {
        wallet: {
          update: jest.fn().mockResolvedValue({
            ...mockWallet,
            balance: 623,
          }),
        },
        walletTransaction: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      const transactionCallback = jest.fn(async (tx) => {
        // Simulate the transaction execution
        return {
          ok: true,
          newBalance: 623,
        };
      });

      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockResolvedValue(mockWallet as any);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(transactionCallback);

      await controller.updateBalance({
        userId,
        amount,
        transactionType: 'ADD',
        description: 'transaction test',
      });

      // Verify $transaction was called (atomic operation)
      expect(prismaService.$transaction).toHaveBeenCalled();
    });
  });

  describe('UpdateBalance - Error Handling', () => {
    it('should return error when wallet not found', async () => {
      jest.spyOn(prismaService.wallet, 'findUnique').mockResolvedValue(null);

      const result = await controller.updateBalance({
        userId: 'user-nonexistent',
        amount: 100,
        transactionType: 'ADD',
        description: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Wallet not found');
    });

    it('should catch and return error message on unexpected exceptions', async () => {
      jest
        .spyOn(prismaService.wallet, 'findUnique')
        .mockRejectedValue(new Error('Database connection failed'));

      const result = await controller.updateBalance({
        userId: 'user-123',
        amount: 100,
        transactionType: 'ADD',
        description: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to update balance');
    });
  });
});
