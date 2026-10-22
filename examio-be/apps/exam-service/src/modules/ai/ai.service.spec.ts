import { Metadata } from '@grpc/grpc-js';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AIService } from './ai.service';
import { AIRepository } from './ai.repository';
import { GenerateIdService } from '@examio/common';
import { R2Client } from '../../clients/r2.client';
import { RedisService } from '@examio/redis';
import { FinanceClientService } from '../finance-client/finance-client.service';

describe('AIService', () => {
    let service: AIService;
    let httpService: { post: jest.Mock; delete: jest.Mock; get: jest.Mock };
    let aiRepository: {
        findDuplicateUserStorage: jest.Mock;
        updateUserStorageStatus: jest.Mock;
        findUserStorageById: jest.Mock;
        countDocumentsByUserStorageId: jest.Mock;
        createUserStorage: jest.Mock;
        deleteUploadAggregate: jest.Mock;
        countUserStorageThisMonth: jest.Mock;
    };
    let finance: { deductCredits: jest.Mock };
    let r2ClientService: {
        uploadFile: jest.Mock;
        getPublicUrl: jest.Mock;
        deleteFile: jest.Mock;
    };

    beforeEach(async () => {
        httpService = {
            post: jest.fn(),
            get: jest.fn(),
            delete: jest.fn().mockReturnValue(of({ data: { success: true } })),
        };

        aiRepository = {
            findDuplicateUserStorage: jest.fn(),
            updateUserStorageStatus: jest.fn(),
            findUserStorageById: jest.fn(),
            countDocumentsByUserStorageId: jest.fn(),
            createUserStorage: jest.fn(),
            deleteUploadAggregate: jest.fn(),
            countUserStorageThisMonth: jest.fn().mockResolvedValue(0),
        };

        r2ClientService = {
            uploadFile: jest.fn(),
            getPublicUrl: jest.fn(),
            deleteFile: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AIService,
                {
                    provide: AIRepository,
                    useValue: aiRepository,
                },
                {
                    provide: GenerateIdService,
                    useValue: { generateId: jest.fn().mockReturnValue('generated-id') },
                },
                {
                    provide: HttpService,
                    useValue: httpService,
                },
                {
                    provide: FinanceClientService,
                    useValue: {
                        deductCredits: jest.fn(),
                        getUserBenefits: jest
                            .fn()
                            .mockResolvedValue({ filesPerMonth: -1 }),
                    },
                },
                {
                    provide: R2Client,
                    useValue: r2ClientService,
                },
                {
                    provide: RedisService,
                    useValue: {
                        get: jest.fn(),
                        set: jest.fn(),
                        del: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get(AIService);
        finance = module.get(FinanceClientService);
    });

    it('forwards narrow search params when generating from duplicate completed upload', async () => {
        aiRepository.findDuplicateUserStorage.mockResolvedValue({
            id: 'upload-1',
            processingStatus: 'COMPLETED',
        });
        aiRepository.updateUserStorageStatus.mockResolvedValue({});
        aiRepository.findUserStorageById.mockResolvedValue({
            id: 'upload-1',
            processingStatus: 'COMPLETED',
        });
        aiRepository.countDocumentsByUserStorageId.mockResolvedValue(3);

        httpService.post.mockReturnValue(
            of({ data: { success: true, history_id: 'history-1' } })
        );

        const user = { id: 'user-1' } as any;
        const file = {
            originalname: 'file.pdf',
            size: 1024,
            buffer: Buffer.from('content'),
            mimetype: 'application/pdf',
        } as Express.Multer.File;

        const result = await service.generateFromFile(user, file, {
            typeResult: '1',
            quantityQuizz: '5',
            isNarrowSearch: 'true',
            keyword: 'kiến trúc hệ thống',
            modelType: 'gemini',
        });

        expect(result.jobId).toBe('upload-1');

        await new Promise((resolve) => setImmediate(resolve));

        expect(httpService.post).toHaveBeenCalledWith(
            expect.stringContaining('/generate/quiz'),
            expect.objectContaining({
                userStorageId: 'upload-1',
                userId: 'user-1',
                numQuestions: 5,
                isNarrowSearch: true,
                keyword: 'kiến trúc hệ thống',
                modelType: 'gemini',
            }),
            expect.any(Object)
        );
    });

    it('forwards narrow search params when regenerating content', async () => {
        const upload = {
            id: 'upload-2',
            userId: 'user-1',
            filename: 'file.pdf',
            processingStatus: 'COMPLETED',
        };

        jest.spyOn(service, 'getUploadDetail').mockResolvedValue(upload as any);
        aiRepository.updateUserStorageStatus.mockResolvedValue({});
        aiRepository.findUserStorageById.mockResolvedValue(upload);
        aiRepository.countDocumentsByUserStorageId.mockResolvedValue(5);
        httpService.post.mockReturnValue(
            of({ data: { success: true, history_id: 'history-2' } })
        );

        const result = await service.regenerate('upload-2', { id: 'user-1' } as any, {
            typeResult: 2,
            quantityFlashcard: 7,
            isNarrowSearch: true,
            keyword: 'flashcard keyword',
            modelType: 'gemini',
        });

        expect(result.jobId).toBe('upload-2');

        await new Promise((resolve) => setImmediate(resolve));

        expect(httpService.post).toHaveBeenCalledWith(
            expect.stringContaining('/generate/flashcards'),
            expect.objectContaining({
                userStorageId: 'upload-2',
                userId: 'user-1',
                numFlashcards: 7,
                isNarrowSearch: true,
                keyword: 'flashcard keyword',
                modelType: 'gemini',
            }),
            expect.any(Object)
        );
    });

    it('deletes R2 file, upload aggregate data, and AI cache when deleting upload', async () => {
        jest.spyOn(service, 'getUploadDetail').mockResolvedValue({
            id: 'upload-delete-1',
            userId: 'user-1',
            keyR2: 'ai-uploads/file.pdf',
        } as any);
        aiRepository.deleteUploadAggregate.mockResolvedValue({
            documents: 5,
            quizHistories: 2,
            flashcardHistories: 1,
            aiChatDocuments: 1,
            userStorage: { id: 'upload-delete-1' },
        });

        const result = await service.deleteUpload(
            'upload-delete-1',
            { id: 'user-1' } as any
        );

        expect(r2ClientService.deleteFile).toHaveBeenCalledWith(
            'ai-uploads/file.pdf',
            expect.any(Metadata)
        );
        expect(aiRepository.deleteUploadAggregate).toHaveBeenCalledWith(
            'upload-delete-1'
        );
        expect(httpService.delete).toHaveBeenCalledWith(
            expect.stringContaining('/ai/clear-cache/upload-delete-1'),
            expect.any(Object)
        );
        expect(result).toEqual({ success: true, message: 'Xóa thành công' });
    });

    it('still deletes database records when R2 deletion fails', async () => {
        jest.spyOn(service, 'getUploadDetail').mockResolvedValue({
            id: 'upload-delete-2',
            userId: 'user-1',
            keyR2: 'ai-uploads/file.pdf',
        } as any);
        r2ClientService.deleteFile.mockRejectedValueOnce(
            new Error('Cloudflare unavailable')
        );
        aiRepository.deleteUploadAggregate.mockResolvedValue({
            documents: 3,
            quizHistories: 0,
            flashcardHistories: 0,
            aiChatDocuments: 0,
            userStorage: { id: 'upload-delete-2' },
        });

        const result = await service.deleteUpload(
            'upload-delete-2',
            { id: 'user-1' } as any
        );

        expect(aiRepository.deleteUploadAggregate).toHaveBeenCalledWith(
            'upload-delete-2'
        );
        expect(result).toEqual({
            success: true,
            message:
                'Đã xóa dữ liệu trong hệ thống nhưng không thể xóa file trên Cloudflare R2',
            warning: 'Cloudflare unavailable',
        });
    });

    describe('caller token is forwarded to the finance debit (TEACHER lazy wallet)', () => {
        const file = { originalname: 'f.pdf', size: 10, buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File;

        it('createUpload passes the raw user token', async () => {
            aiRepository.createUserStorage.mockResolvedValue({ id: 'generated-id' });
            aiRepository.updateUserStorageStatus.mockResolvedValue({});
            httpService.post.mockReturnValue(of({ data: { success: true } }));

            await service.createUpload(
                { id: 'user-1' } as any,
                { filename: 'a.pdf', url: 'https://x/a.pdf', mimetype: 'application/pdf', size: 4 * 1024 * 1024, keyR2: 'k' } as any,
                'tok-1'
            );

            expect(finance.deductCredits).toHaveBeenCalledWith(
                'user-1', 2, expect.any(String), 'upload:generated-id', { userToken: 'tok-1' }
            );
        });

        it('generateFromFile (reused COMPLETED file) passes the raw user token', async () => {
            aiRepository.findDuplicateUserStorage.mockResolvedValue({ id: 'upload-1', processingStatus: 'COMPLETED' });
            aiRepository.updateUserStorageStatus.mockResolvedValue({});
            httpService.post.mockReturnValue(of({ data: { success: true } }));

            await service.generateFromFile({ id: 'user-1' } as any, file, { typeResult: '1', quantityQuizz: '5' } as any, 'tok-2');

            expect(finance.deductCredits).toHaveBeenCalledWith(
                'user-1', 5, expect.any(String), expect.stringMatching(/^quick-upload-reuse:/), { userToken: 'tok-2' }
            );
        });
    });

    it('regenerate passes the raw user token to the debit', async () => {
        const upload = { id: 'upload-9', userId: 'user-1', filename: 'f.pdf', processingStatus: 'COMPLETED' };
        jest.spyOn(service, 'getUploadDetail').mockResolvedValue(upload as any);
        aiRepository.updateUserStorageStatus.mockResolvedValue({});
        aiRepository.findUserStorageById.mockResolvedValue(upload);
        aiRepository.countDocumentsByUserStorageId.mockResolvedValue(5);
        httpService.post.mockReturnValue(of({ data: { success: true } }));

        await service.regenerate('upload-9', { id: 'user-1' } as any, { typeResult: 1, quantityQuizz: 10 } as any, 'tok-3');

        expect(finance.deductCredits).toHaveBeenCalledWith(
            'user-1', 1, expect.any(String), expect.stringMatching(/^regenerate:/), { userToken: 'tok-3' }
        );
    });

    describe('debit idempotency keys (no double charge on retry)', () => {
        it('createUpload charges once per file: key is upload:<storageId>', async () => {
            aiRepository.createUserStorage.mockResolvedValue({ id: 'generated-id' });
            aiRepository.updateUserStorageStatus.mockResolvedValue({});
            httpService.post.mockReturnValue(of({ data: { success: true } }));

            await service.createUpload({ id: 'user-1' } as any, {
                filename: 'a.pdf',
                url: 'https://x/a.pdf',
                mimetype: 'application/pdf',
                size: 4 * 1024 * 1024,
                keyR2: 'k',
            } as any);

            expect(finance.deductCredits).toHaveBeenCalledWith(
                'user-1',
                2,
                expect.stringContaining('Upload file'),
                'upload:generated-id',
                { userToken: undefined }
            );
            expect(aiRepository.createUserStorage).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'generated-id' })
            );
        });

        it('a reused COMPLETED file gets a fresh per-request key each time', async () => {
            aiRepository.findDuplicateUserStorage.mockResolvedValue({ id: 'upload-1', processingStatus: 'COMPLETED' });
            aiRepository.updateUserStorageStatus.mockResolvedValue({});
            httpService.post.mockReturnValue(of({ data: { success: true } }));
            const file = { originalname: 'f.pdf', size: 10, buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File;

            await service.generateFromFile({ id: 'user-1' } as any, file, { typeResult: '1', quantityQuizz: '5' } as any);
            await service.generateFromFile({ id: 'user-1' } as any, file, { typeResult: '1', quantityQuizz: '5' } as any);

            const keys = finance.deductCredits.mock.calls.map((c) => c[3] as string);
            expect(keys).toHaveLength(2);
            for (const k of keys) expect(k).toMatch(/^quick-upload-reuse:[0-9a-f-]{36}$/);
            expect(new Set(keys).size).toBe(2);
        });

        it('a reused COMPLETED file fails closed when the debit is refused: no generation runs for free', async () => {
            aiRepository.findDuplicateUserStorage.mockResolvedValue({ id: 'upload-1', processingStatus: 'COMPLETED' });
            aiRepository.updateUserStorageStatus.mockResolvedValue({});
            const refused = new ForbiddenException('Không đủ tín dụng: Insufficient balance. Vui lòng nạp thêm.');
            finance.deductCredits.mockRejectedValue(refused);
            const file = { originalname: 'f.pdf', size: 10, buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File;

            await expect(
                service.generateFromFile({ id: 'user-1' } as any, file, { typeResult: '1', quantityQuizz: '5' } as any)
            ).rejects.toBe(refused);

            expect(aiRepository.updateUserStorageStatus).not.toHaveBeenCalled();
            expect(httpService.post).not.toHaveBeenCalled();
        });
    });
});
