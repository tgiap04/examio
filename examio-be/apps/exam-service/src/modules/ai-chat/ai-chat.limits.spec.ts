import { ForbiddenException } from '@nestjs/common';
import { AIChatService } from './ai-chat.service';

type Benefits = {
    tier: number;
    tierName: string;
    filesPerMonth: number;
    messagesPerMinute: number;
    chatMessagesLimit: number;
};

type LimitChecker = { checkLimits(userId: string, chatId: string): Promise<void> };

const FREE: Benefits = {
    tier: 0,
    tierName: 'Free',
    filesPerMonth: 5,
    messagesPerMinute: 5,
    chatMessagesLimit: 30,
};

describe('AIChatService.checkLimits', () => {
    let chatRepository: {
        countMessagesLastMinute: jest.Mock;
        countUserMessagesInChat: jest.Mock;
    };
    let finance: { getUserBenefits: jest.Mock };
    let service: LimitChecker;

    beforeEach(() => {
        chatRepository = {
            countMessagesLastMinute: jest.fn().mockResolvedValue(0),
            countUserMessagesInChat: jest.fn().mockResolvedValue(0),
        };
        finance = { getUserBenefits: jest.fn().mockResolvedValue(FREE) };
        service = new AIChatService(
            chatRepository as never,
            {} as never,
            finance as never,
            {} as never,
            {} as never
        ) as unknown as LimitChecker;
    });

    it('allows a message one below each Free-tier limit (boundary)', async () => {
        chatRepository.countMessagesLastMinute.mockResolvedValue(4);
        chatRepository.countUserMessagesInChat.mockResolvedValue(29);
        await expect(service.checkLimits('u1', 'c1')).resolves.toBeUndefined();
    });

    it('blocks the message that reaches messagesPerMinute', async () => {
        chatRepository.countMessagesLastMinute.mockResolvedValue(5);
        await expect(service.checkLimits('u1', 'c1')).rejects.toThrow(
            ForbiddenException
        );
        await expect(service.checkLimits('u1', 'c1')).rejects.toThrow(
            /5 tin nhắn\/phút/
        );
    });

    it('blocks once the chat reaches chatMessagesLimit', async () => {
        chatRepository.countUserMessagesInChat.mockResolvedValue(30);
        await expect(service.checkLimits('u1', 'c1')).rejects.toThrow(
            /Giới hạn hội thoại: 30/
        );
        expect(chatRepository.countUserMessagesInChat).toHaveBeenCalledWith('c1');
    });

    it('skips both counts for unlimited (-1) benefits', async () => {
        finance.getUserBenefits.mockResolvedValue({
            ...FREE,
            messagesPerMinute: -1,
            chatMessagesLimit: -1,
        });
        chatRepository.countMessagesLastMinute.mockResolvedValue(10_000);
        chatRepository.countUserMessagesInChat.mockResolvedValue(10_000);
        await expect(service.checkLimits('u1', 'c1')).resolves.toBeUndefined();
        expect(chatRepository.countMessagesLastMinute).not.toHaveBeenCalled();
        expect(chatRepository.countUserMessagesInChat).not.toHaveBeenCalled();
    });

    it('falls back to Free limits when the benefits lookup fails', async () => {
        finance.getUserBenefits.mockRejectedValue(new Error('finance unavailable'));
        chatRepository.countMessagesLastMinute.mockResolvedValue(5);
        await expect(service.checkLimits('u1', 'c1')).rejects.toThrow(
            /5 tin nhắn\/phút/
        );
    });
});
