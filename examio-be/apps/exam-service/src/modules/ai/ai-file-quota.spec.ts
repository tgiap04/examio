import { ForbiddenException } from '@nestjs/common';
import { AIService } from './ai.service';

type QuotaEnforcer = { enforceFileUploadQuota(userId: string): Promise<void> };

describe('AIService.enforceFileUploadQuota', () => {
    let aiRepository: { countUserStorageThisMonth: jest.Mock };
    let financeClient: { getUserBenefits: jest.Mock };
    let service: QuotaEnforcer;

    beforeEach(() => {
        aiRepository = { countUserStorageThisMonth: jest.fn().mockResolvedValue(0) };
        financeClient = {
            getUserBenefits: jest.fn().mockResolvedValue({
                tier: 0,
                tierName: 'Free',
                filesPerMonth: 5,
                messagesPerMinute: 5,
                chatMessagesLimit: 30,
            }),
        };
        service = new AIService(
            aiRepository as never,
            {} as never,
            {} as never,
            financeClient as never,
            {} as never,
            {} as never
        ) as unknown as QuotaEnforcer;
    });

    it('allows the upload while the monthly count is below filesPerMonth', async () => {
        aiRepository.countUserStorageThisMonth.mockResolvedValue(4);
        await expect(service.enforceFileUploadQuota('u1')).resolves.toBeUndefined();
    });

    it('rejects the upload once the monthly count reaches filesPerMonth', async () => {
        aiRepository.countUserStorageThisMonth.mockResolvedValue(5);
        await expect(service.enforceFileUploadQuota('u1')).rejects.toThrow(
            ForbiddenException
        );
        await expect(service.enforceFileUploadQuota('u1')).rejects.toThrow(
            /5 file\/tháng/
        );
    });

    it('skips the count entirely for unlimited (-1) benefits', async () => {
        financeClient.getUserBenefits.mockResolvedValue({
            tier: 3,
            tierName: 'VIP',
            filesPerMonth: -1,
            messagesPerMinute: -1,
            chatMessagesLimit: -1,
        });
        aiRepository.countUserStorageThisMonth.mockResolvedValue(10_000);
        await expect(service.enforceFileUploadQuota('u1')).resolves.toBeUndefined();
        expect(aiRepository.countUserStorageThisMonth).not.toHaveBeenCalled();
    });
});
