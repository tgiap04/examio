import { Test, TestingModule } from '@nestjs/testing';
import { AiClient } from '../../clients/ai.client';
import { RedisService } from '@examio/redis';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { WordFamilyService } from './word-family.service';
import { WordFamilyRepository } from './word-family.repository';

describe('WordFamilyService', () => {
    let service: WordFamilyService;
    let mockRedisClient: any;
    let mockRedisService: any;
    let mockRepository: any;
    let mockAi: any;

    beforeEach(async () => {
        // Mock Redis client (what getClient() returns)
        // Daily quota counter (multi().incr().expire().exec()): always under the cap here.
        const quotaChain: any = {
            incr: jest.fn().mockReturnThis(),
            expire: jest.fn().mockReturnThis(),
            exec: jest.fn().mockResolvedValue([[null, 1], [null, 1]]),
        };
        mockRedisClient = {
            multi: jest.fn().mockReturnValue(quotaChain),
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
            findWordFamilyByRoot: jest.fn(),
        };

        // Mock AiClient (HTTP to ai-service)
        mockAi = {
            generateWordFamily: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WordFamilyService,
                {
                    provide: WordFamilyRepository,
                    useValue: mockRepository,
                },
                {
                    provide: AiClient,
                    useValue: mockAi,
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
                `vocab:gen:lock:${userId}:${categorySlug}`
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
                `vocab:gen:lock:${userId}:${categorySlug}`
            );
        });

        it('should construct the correct lock key with userId and categorySlug', async () => {
            mockRedisClient.get.mockResolvedValue(null);
            const anotherUserId = 'user-other-456';
            const anotherSlug = 'french-nouns';
            const anotherUser = { id: anotherUserId } as any;

            await service.getGenerationStatus(anotherUser, anotherSlug);

            expect(mockRedisClient.get).toHaveBeenCalledWith(
                `vocab:gen:lock:${anotherUserId}:${anotherSlug}`
            );
        });
    });

    describe('getRootGenerationStatus', () => {
        const userId = 'user-test-123';
        const categorySlug = 'english-verbs';
        const rootWord = 'run';
        const user = { id: userId } as any;

        it('(a) should return generating=true and startedAt when lock is present', async () => {
            const isoTimestamp = '2026-07-13T19:40:00.000Z';
            mockRedisClient.get.mockResolvedValue(isoTimestamp);

            const result = await service.getRootGenerationStatus(user, categorySlug, rootWord);

            expect(result).toEqual({
                categorySlug,
                rootWord,
                generating: true,
                startedAt: isoTimestamp,
            });
            expect(mockRedisClient.get).toHaveBeenCalledWith(
                `vocab:gen:lock:${userId}:${categorySlug}:${rootWord}`
            );
        });

        it('(b) should return generating=false and startedAt=null when lock is absent', async () => {
            mockRedisClient.get.mockResolvedValue(null);

            const result = await service.getRootGenerationStatus(user, categorySlug, rootWord);

            expect(result).toEqual({
                categorySlug,
                rootWord,
                generating: false,
                startedAt: null,
            });
            expect(mockRedisClient.get).toHaveBeenCalledWith(
                `vocab:gen:lock:${userId}:${categorySlug}:${rootWord}`
            );
        });

        it('(c) should trim rootWord when building the lock key', async () => {
            mockRedisClient.get.mockResolvedValue(null);
            const rootWordWithWhitespace = '  run  ';

            await service.getRootGenerationStatus(user, categorySlug, rootWordWithWhitespace);

            expect(mockRedisClient.get).toHaveBeenCalledWith(
                `vocab:gen:lock:${userId}:${categorySlug}:run`
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

        describe('(a) Returns immediately with generation status; root-specific lock; fires background job', () => {
            it('should return immediately with { generating: true, categorySlug, rootWord, startedAt } and acquire root-specific lock', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK'); // Lock acquired
                mockAi.generateWordFamily.mockResolvedValue({ success: true, data: { words: [] } });

                const dto = { categorySlug, rootWord };
                const result = await service.generateWordFamilyForRoot(user, dto);

                // Assert return value is immediate (not awaiting the background job result)
                expect(result).toEqual({
                    generating: true,
                    categorySlug,
                    rootWord,
                    startedAt: expect.any(String), // ISO timestamp
                });

                // Assert category was looked up
                expect(mockRepository.findCategoryBySlug).toHaveBeenCalledWith(categorySlug);

                // Assert lock was acquired with ROOT-SPECIFIC key (includes rootWord)
                const lockKey = `vocab:gen:lock:${userId}:${categorySlug}:${rootWord}`;
                expect(mockRedisClient.set).toHaveBeenCalledWith(
                    lockKey,
                    expect.any(String), // ISO timestamp
                    'EX',
                    1800, // TTL
                    'NX',
                );
            });

            it('should trim rootWord before returning', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK');
                mockAi.generateWordFamily.mockResolvedValue({ success: true, data: { words: [] } });

                const dtoWithWhitespace = { categorySlug, rootWord: '  run  ' };
                const result = await service.generateWordFamilyForRoot(user, dtoWithWhitespace);

                expect(result.rootWord).toBe('run'); // Trimmed
            });
        });

        describe('(b) ConflictException if lock not acquired', () => {
            it('should throw ConflictException when root-specific lock cannot be acquired', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue(null); // Lock already held

                const dto = { categorySlug, rootWord };

                await expect(service.generateWordFamilyForRoot(user, dto)).rejects.toThrow(
                    expect.objectContaining({
                        message: expect.stringContaining(
                            'Đang sinh từ con cho',
                        ),
                    }),
                );

                // Verify runRootGeneration was NOT started
                expect(mockAi.generateWordFamily).not.toHaveBeenCalled();
            });
        });

        describe('(c) NotFoundException if category missing; no lock acquired', () => {
            it('should throw NotFoundException when category does not exist', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(null);

                const dto = { categorySlug, rootWord };

                await expect(service.generateWordFamilyForRoot(user, dto)).rejects.toThrow(
                    expect.objectContaining({
                        message: 'Không tìm thấy danh mục.',
                    }),
                );

                // Verify lock was NOT acquired (early exit before lock)
                expect(mockRedisClient.set).not.toHaveBeenCalled();
            });
        });

        describe('(d) rootWord is trimmed', () => {
            it('should trim whitespace from rootWord in return object', async () => {
                mockRepository.findCategoryBySlug.mockResolvedValue(category);
                mockRedisClient.set.mockResolvedValue('OK');

                const dtoWithWhitespace = { categorySlug, rootWord: '  run  ' };
                const result = await service.generateWordFamilyForRoot(user, dtoWithWhitespace);

                expect(result.rootWord).toBe('run');
            });
        });
    });

    describe('runRootGeneration (background worker)', () => {
        const userId = 'user-test-123';
        const categorySlug = 'english-verbs';
        const rootWord = 'run';
        const user = { id: userId } as any;
        const category = {
            id: 'cat-123',
            slug: categorySlug,
            name: 'English Verbs',
        } as any;
        const lockKey = `vocab:gen:lock:${userId}:${categorySlug}:${rootWord}`;

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

        describe('(a) Success path: calls AI, saves with forced rootWord, releases lock', () => {
            it('should call AI service, save via createWordFamily with forced rootWord, and release lock', async () => {
                mockAi.generateWordFamily.mockResolvedValue(aiResponse);
                mockRepository.createWordFamily.mockResolvedValue({
                    id: 'wf-123',
                    rootWord,
                    categorySlug,
                });

                // Call the private method directly
                await service['runRootGeneration'](category, categorySlug, rootWord, lockKey);

                // Assert AI service was called
                expect(mockAi.generateWordFamily).toHaveBeenCalledWith(
                    expect.objectContaining({
                        categorySlug,
                        categoryName: category.name,
                        numRootWords: 1,
                        excludeRootWords: [],
                        rootWord,
                    }),
                );

                // Assert repository was called with forced rootWord
                expect(mockRepository.createWordFamily).toHaveBeenCalledWith({
                    rootWord,
                    categoryId: category.id,
                    categorySlug,
                    data: expect.objectContaining({
                        rootWord,
                        categorySlug,
                    }),
                });

                // Assert lock was released in finally
                expect(mockRedisService.del).toHaveBeenCalledWith(lockKey);
            });
        });

        describe('(b) AI returns success:false: no save, lock still released, no throw', () => {
            it('should log error and release lock without throwing when AI returns success:false', async () => {
                const loggerSpy = jest.spyOn(service['logger'], 'error');
                const aiFailureResponse = {
                    success: false,
                    error: 'Invalid root word',
                };

                mockAi.generateWordFamily.mockResolvedValue(aiFailureResponse);

                // Call runRootGeneration and expect NO throw
                await expect(
                    service['runRootGeneration'](category, categorySlug, rootWord, lockKey),
                ).resolves.not.toThrow();

                // Assert no save was attempted
                expect(mockRepository.createWordFamily).not.toHaveBeenCalled();

                // Assert lock was released in finally
                expect(mockRedisService.del).toHaveBeenCalledWith(lockKey);

                // Assert error was logged
                expect(loggerSpy).toHaveBeenCalled();

                loggerSpy.mockRestore();
            });

            it('should log error and release lock without throwing when AI response has no data', async () => {
                const loggerSpy = jest.spyOn(service['logger'], 'error');
                const aiNoDataResponse = {
                    success: true,
                    // data is missing
                };

                mockAi.generateWordFamily.mockResolvedValue(aiNoDataResponse);

                // Call runRootGeneration and expect NO throw
                await expect(
                    service['runRootGeneration'](category, categorySlug, rootWord, lockKey),
                ).resolves.not.toThrow();

                // Assert no save was attempted
                expect(mockRepository.createWordFamily).not.toHaveBeenCalled();

                // Assert lock was released
                expect(mockRedisService.del).toHaveBeenCalledWith(lockKey);

                loggerSpy.mockRestore();
            });
        });

        describe('(c) Error thrown: lock still released, no throw propagates', () => {
            it('should release lock in finally and not throw when AI service throws', async () => {
                const loggerSpy = jest.spyOn(service['logger'], 'error');
                const httpError = new Error('Network error');
                mockAi.generateWordFamily.mockRejectedValue(httpError);

                // Call runRootGeneration and expect NO throw (errors are caught)
                await expect(
                    service['runRootGeneration'](category, categorySlug, rootWord, lockKey),
                ).resolves.not.toThrow();

                // Assert lock was released in finally
                expect(mockRedisService.del).toHaveBeenCalledWith(lockKey);

                // Assert error was logged
                expect(loggerSpy).toHaveBeenCalled();

                loggerSpy.mockRestore();
            });

            it('should release lock in finally and not throw when repository throws', async () => {
                const loggerSpy = jest.spyOn(service['logger'], 'error');
                mockAi.generateWordFamily.mockResolvedValue(aiResponse);

                const dbError = new Error('Database constraint violation');
                mockRepository.createWordFamily.mockRejectedValue(dbError);

                // Call runRootGeneration and expect NO throw
                await expect(
                    service['runRootGeneration'](category, categorySlug, rootWord, lockKey),
                ).resolves.not.toThrow();

                // Assert lock was released
                expect(mockRedisService.del).toHaveBeenCalledWith(lockKey);

                // Assert error was logged
                expect(loggerSpy).toHaveBeenCalled();

                loggerSpy.mockRestore();
            });
        });
    });

    describe('getWordFamily', () => {
        const rootWord = 'run';
        const categorySlug = 'english-verbs';

        describe('Success path: returns flattened object with words at top level', () => {
            it('should return flattened object with words extracted from data.words', async () => {
                const familyRecord = {
                    id: 'wf-123',
                    rootWord,
                    categorySlug,
                    categoryId: 'cat-123',
                    data: {
                        words: [
                            { word: 'running', pos: 'verb' },
                            { word: 'runner', pos: 'noun' },
                        ],
                    },
                    createdAt: new Date('2026-07-13T10:00:00Z'),
                    updatedAt: new Date('2026-07-13T10:00:00Z'),
                };

                mockRepository.findWordFamilyByRoot.mockResolvedValue(familyRecord);

                const result = await service.getWordFamily(rootWord, categorySlug);

                // Assert flattened structure with words at top level
                expect(result).toEqual({
                    id: 'wf-123',
                    rootWord,
                    categorySlug,
                    words: [
                        { word: 'running', pos: 'verb' },
                        { word: 'runner', pos: 'noun' },
                    ],
                    createdAt: familyRecord.createdAt,
                    updatedAt: familyRecord.updatedAt,
                });
            });

            it('should return empty words array when data.words is missing', async () => {
                const familyRecord = {
                    id: 'wf-123',
                    rootWord,
                    categorySlug,
                    categoryId: 'cat-123',
                    data: {
                        // words is missing
                    },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                mockRepository.findWordFamilyByRoot.mockResolvedValue(familyRecord);

                const result = await service.getWordFamily(rootWord, categorySlug);

                expect(result.words).toEqual([]);
            });
        });

        describe('Error path: NotFoundException when not found', () => {
            it('should throw NotFoundException when word family does not exist', async () => {
                mockRepository.findWordFamilyByRoot.mockResolvedValue(null);

                await expect(service.getWordFamily(rootWord, categorySlug)).rejects.toThrow(
                    expect.objectContaining({
                        message: expect.stringContaining(`Không tìm thấy word family`),
                    }),
                );
            });
        });
    });
});
