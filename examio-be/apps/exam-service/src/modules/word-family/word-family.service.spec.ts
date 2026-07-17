import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { RedisService } from '@examio/redis';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { WordFamilyService } from './word-family.service';
import { WordFamilyRepository } from './word-family.repository';

describe('WordFamilyService', () => {
    let service: WordFamilyService;
    let mockRedisClient: any;
    let mockRedisService: any;
    let mockRepository: any;
    let mockHttpService: any;

    beforeEach(async () => {
        // Mock Redis client (what getClient() returns)
        mockRedisClient = {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
        };

        // Mock RedisService (what's injected)
        mockRedisService = {
            getClient: jest.fn().mockReturnValue(mockRedisClient),
            del: jest.fn(),
        };

        // Mock WordFamilyRepository
        mockRepository = {
            findCategories: jest.fn(),
            createCategory: jest.fn(),
            findCategoryBySlug: jest.fn(),
            createWordFamily: jest.fn(),
        };

        // Mock HttpService
        mockHttpService = {
            post: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WordFamilyService,
                {
                    provide: WordFamilyRepository,
                    useValue: mockRepository,
                },
                {
                    provide: HttpService,
                    useValue: mockHttpService,
                },
                {
                    provide: RedisService,
                    useValue: mockRedisService,
                },
            ],
        }).compile();

        service = module.get(WordFamilyService);
    });

    describe('getGenerationStatus', () => {
        const userId = 'user-test-123';
        const categorySlug = 'english-verbs';
        const user = { id: userId } as any;

        it('should return generating=false and startedAt=null when no lock is held in redis', async () => {
            mockRedisClient.get.mockResolvedValue(null);

            const result = await service.getGenerationStatus(user, categorySlug);

            expect(result).toEqual({
                categorySlug,
                generating: false,
                startedAt: null,
            });
            expect(mockRedisClient.get).toHaveBeenCalledWith(
                `wf:gen:lock:${userId}:${categorySlug}`
            );
        });

        it('should return generating=true and the ISO string startedAt when lock is held in redis', async () => {
            const isoTimestamp = '2026-07-13T19:40:00.000Z';
            mockRedisClient.get.mockResolvedValue(isoTimestamp);

            const result = await service.getGenerationStatus(user, categorySlug);

            expect(result).toEqual({
                categorySlug,
                generating: true,
                startedAt: isoTimestamp,
            });
            expect(mockRedisClient.get).toHaveBeenCalledWith(
                `wf:gen:lock:${userId}:${categorySlug}`
            );
        });

        it('should construct the correct lock key with userId and categorySlug', async () => {
            mockRedisClient.get.mockResolvedValue(null);
            const anotherUserId = 'user-other-456';
            const anotherSlug = 'french-nouns';
            const anotherUser = { id: anotherUserId } as any;

            await service.getGenerationStatus(anotherUser, anotherSlug);

            expect(mockRedisClient.get).toHaveBeenCalledWith(
                `wf:gen:lock:${anotherUserId}:${anotherSlug}`
            );
        });
    });

    describe('generateWordFamilyForRoot', () => {
        const userId = 'user-test-123';
        const categorySlug = 'english-verbs';
        const rootWord = 'run';
        const user = { id: userId } as any;
        const category = {
            id: 'cat-123',
            slug: categorySlug,
            name: 'English Verbs',
        } as any;

        const aiResponse = {
            success: true,
            data: {
                rootWord: 'run',
                categorySlug: categorySlug,
                words: [
                    {
                        word: 'running',
                        pos: 'verb',
                        meaningEn: 'moving quickly',
                        meaningVi: 'chạy',
                        example: 'I am running fast',
                        affix: { prefix: '', root: 'run', suffix: 'ing' },
                    },
                    {
                        word: 'runner',
                        pos: 'noun',
                        meaningEn: 'one who runs',
                        meaningVi: 'vận động viên',
                        example: 'She is a runner',
                        affix: { prefix: '', root: 'run', suffix: 'er' },
                    },
                ],
            },
        };

        const savedRecord = {
            id: 'wf-123',
            rootWord,
            categorySlug,
            categoryId: 'cat-123',
            data: aiResponse.data,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any;

        describe('(a) Success path - forces dto.rootWord into saved record', () => {
            it('should successfully generate word family for specific root and force rootWord/categorySlug', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK');
                mockHttpService.post.mockReturnValue(of({ data: aiResponse }));
                mockRepository.createWordFamily.mockResolvedValue(savedRecord);

                const dto = { categorySlug, rootWord };
                const result = await service.generateWordFamilyForRoot(user, dto);

                // Verify category was looked up
                expect(mockRepository.findCategoryBySlug).toHaveBeenCalledWith(categorySlug);

                // Verify lock was acquired with correct key
                const lockKey = `wf:gen:lock:${userId}:${categorySlug}:${rootWord}`;
                expect(mockRedisClient.set).toHaveBeenCalledWith(
                    lockKey,
                    expect.any(String), // ISO timestamp
                    'EX',
                    1800,
                    'NX',
                );

                // Verify AI endpoint was called with correct payload
                expect(mockHttpService.post).toHaveBeenCalledWith(
                    expect.stringContaining('/generate/word-family'),
                    expect.objectContaining({
                        categorySlug,
                        categoryName: category.name,
                        numRootWords: 1,
                        excludeRootWords: [],
                        rootWord,
                    }),
                    expect.any(Object),
                );

                // CRITICAL: Verify the saved record forces rootWord and categorySlug from DTO
                expect(mockRepository.createWordFamily).toHaveBeenCalledWith({
                    rootWord,
                    categoryId: category.id,
                    categorySlug,
                    data: expect.objectContaining({
                        rootWord,
                        categorySlug,
                    }),
                });

                // Verify lock was released
                expect(mockRedisService.del).toHaveBeenCalledWith(lockKey);

                // Verify return value
                expect(result).toEqual(savedRecord);
            });

            it('should trim whitespace from rootWord before using it', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK');
                mockHttpService.post.mockReturnValue(of({ data: aiResponse }));
                mockRepository.createWordFamily.mockResolvedValue(savedRecord);

                const dtoWithWhitespace = { categorySlug, rootWord: '  run  ' };
                await service.generateWordFamilyForRoot(user, dtoWithWhitespace);

                // Lock key should use trimmed rootWord
                const expectedLockKey = `wf:gen:lock:${userId}:${categorySlug}:run`;
                expect(mockRedisClient.set).toHaveBeenCalledWith(
                    expectedLockKey,
                    expect.any(String),
                    'EX',
                    expect.any(Number),
                    'NX',
                );

                // createWordFamily should also use trimmed rootWord
                expect(mockRepository.createWordFamily).toHaveBeenCalledWith(
                    expect.objectContaining({
                        rootWord: 'run',
                    }),
                );
            });
        });

        describe('(e) Missing category → NotFoundException', () => {
            it('should throw NotFoundException when category does not exist', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(null);

                const dto = { categorySlug, rootWord };

                await expect(service.generateWordFamilyForRoot(user, dto)).rejects.toThrow(
                    expect.objectContaining({
                        message: 'Không tìm thấy danh mục.',
                    }),
                );

                // Verify lock was NOT acquired (early exit)
                expect(mockRedisClient.set).not.toHaveBeenCalled();
            });
        });

        describe('(b) Lock not acquired → ConflictException', () => {
            it('should throw ConflictException when lock cannot be acquired', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                // Return falsy value (lock already held)
                mockRedisClient.set.mockResolvedValue(null);

                const dto = { categorySlug, rootWord };

                await expect(service.generateWordFamilyForRoot(user, dto)).rejects.toThrow(
                    expect.objectContaining({
                        message: expect.stringContaining(
                            `Bạn đang sinh từ con cho "${rootWord}" chưa hoàn tất`,
                        ),
                    }),
                );

                // Verify AI service was NOT called (lock failed)
                expect(mockHttpService.post).not.toHaveBeenCalled();
            });

            it('should construct unique lock keys for different roots (allowing parallel generation)', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK');
                mockHttpService.post.mockReturnValue(of({ data: aiResponse }));
                mockRepository.createWordFamily.mockResolvedValue(savedRecord);

                const rootWord1 = 'run';
                const rootWord2 = 'walk';

                const dto1 = { categorySlug, rootWord: rootWord1 };
                const dto2 = { categorySlug, rootWord: rootWord2 };

                await service.generateWordFamilyForRoot(user, dto1);
                await service.generateWordFamilyForRoot(user, dto2);

                const lockKey1 = `wf:gen:lock:${userId}:${categorySlug}:${rootWord1}`;
                const lockKey2 = `wf:gen:lock:${userId}:${categorySlug}:${rootWord2}`;

                expect(mockRedisClient.set).toHaveBeenCalledWith(
                    lockKey1,
                    expect.any(String),
                    'EX',
                    expect.any(Number),
                    'NX',
                );
                expect(mockRedisClient.set).toHaveBeenCalledWith(
                    lockKey2,
                    expect.any(String),
                    'EX',
                    expect.any(Number),
                    'NX',
                );
            });
        });

        describe('(c) AI returns success:false → BadRequestException', () => {
            it('should throw BadRequestException when AI response has success:false', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK');

                const aiFailureResponse = {
                    success: false,
                    error: 'AI generation failed: invalid root word',
                };

                mockHttpService.post.mockReturnValue(of({ data: aiFailureResponse }));

                const dto = { categorySlug, rootWord };

                await expect(service.generateWordFamilyForRoot(user, dto)).rejects.toThrow(
                    expect.objectContaining({
                        message: 'AI generation failed: invalid root word',
                    }),
                );

                // Verify lock was still released in finally
                const lockKey = `wf:gen:lock:${userId}:${categorySlug}:${rootWord}`;
                expect(mockRedisService.del).toHaveBeenCalledWith(lockKey);
            });

            it('should throw BadRequestException when AI response has no data', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK');

                const aiNoDataResponse = {
                    success: true,
                    // data is missing
                };

                mockHttpService.post.mockReturnValue(of({ data: aiNoDataResponse }));

                const dto = { categorySlug, rootWord };

                await expect(service.generateWordFamilyForRoot(user, dto)).rejects.toThrow(
                    BadRequestException,
                );

                // Verify lock was released
                const lockKey = `wf:gen:lock:${userId}:${categorySlug}:${rootWord}`;
                expect(mockRedisService.del).toHaveBeenCalledWith(lockKey);
            });

            it('should use custom error message if AI response includes error field', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK');

                const customError = 'Root word contains invalid characters';
                const aiFailureResponse = {
                    success: false,
                    error: customError,
                };

                mockHttpService.post.mockReturnValue(of({ data: aiFailureResponse }));

                const dto = { categorySlug, rootWord };

                await expect(service.generateWordFamilyForRoot(user, dto)).rejects.toThrow(
                    customError,
                );
            });
        });

        describe('(d) Lock released in finally on both success and error', () => {
            it('should release lock in finally block on success', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK');
                mockHttpService.post.mockReturnValue(of({ data: aiResponse }));
                mockRepository.createWordFamily.mockResolvedValue(savedRecord);

                const dto = { categorySlug, rootWord };

                try {
                    await service.generateWordFamilyForRoot(user, dto);
                } catch {
                    // Ignore
                }

                const lockKey = `wf:gen:lock:${userId}:${categorySlug}:${rootWord}`;
                expect(mockRedisService.del).toHaveBeenCalledWith(lockKey);
            });

            it('should release lock in finally block even when AI returns failure', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK');

                mockHttpService.post.mockReturnValue(
                    of({ data: { success: false, error: 'AI error' } })
                );

                const dto = { categorySlug, rootWord };

                try {
                    await service.generateWordFamilyForRoot(user, dto);
                } catch {
                    // Expected to throw
                }

                const lockKey = `wf:gen:lock:${userId}:${categorySlug}:${rootWord}`;
                expect(mockRedisService.del).toHaveBeenCalledWith(lockKey);
            });

            it('should release lock in finally block even when category lookup fails', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(null);

                const dto = { categorySlug, rootWord };

                try {
                    await service.generateWordFamilyForRoot(user, dto);
                } catch {
                    // Expected to throw
                }

                // Lock was never acquired (early exit), so del should NOT be called
                expect(mockRedisService.del).not.toHaveBeenCalled();
            });

            it('should release lock in finally block even when HTTP request throws', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK');

                const httpError = new Error('Network error');
                mockHttpService.post.mockReturnValue(throwError(() => httpError));

                const dto = { categorySlug, rootWord };

                try {
                    await service.generateWordFamilyForRoot(user, dto);
                } catch {
                    // Expected to throw
                }

                const lockKey = `wf:gen:lock:${userId}:${categorySlug}:${rootWord}`;
                expect(mockRedisService.del).toHaveBeenCalledWith(lockKey);
            });
        });

        describe('Edge cases and error handling', () => {
            it('should convert thrown exception from repository to BadRequestException', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK');
                mockHttpService.post.mockReturnValue(of({ data: aiResponse }));

                const dbError = new Error('Database constraint violation');
                mockRepository.createWordFamily.mockRejectedValue(dbError);

                const dto = { categorySlug, rootWord };

                await expect(service.generateWordFamilyForRoot(user, dto)).rejects.toThrow(
                    BadRequestException,
                );

                // Lock still released
                const lockKey = `wf:gen:lock:${userId}:${categorySlug}:${rootWord}`;
                expect(mockRedisService.del).toHaveBeenCalledWith(lockKey);
            });

            it('should log the generation request and success', async () => {
                const loggerSpy = jest.spyOn(service['logger'], 'log');
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK');
                mockHttpService.post.mockReturnValue(of({ data: aiResponse }));
                mockRepository.createWordFamily.mockResolvedValue(savedRecord);

                const dto = { categorySlug, rootWord };
                await service.generateWordFamilyForRoot(user, dto);

                expect(loggerSpy).toHaveBeenCalledWith(
                    expect.stringContaining(
                        `Generating word family for root: category=${categorySlug}, rootWord=${rootWord}`,
                    ),
                );
                expect(loggerSpy).toHaveBeenCalledWith(
                    expect.stringContaining(`Word family generated for root=${rootWord}`),
                );

                loggerSpy.mockRestore();
            });
        });
    });
});
