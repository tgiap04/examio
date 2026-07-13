import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { RedisService } from '@examio/redis';
import { WordFamilyService } from './word-family.service';
import { WordFamilyRepository } from './word-family.repository';

describe('WordFamilyService', () => {
    let service: WordFamilyService;
    let mockRedisClient: { get: jest.Mock };
    let mockRedisService: { getClient: jest.Mock };
    let mockRepository: {
        findCategories: jest.Mock;
        createCategory: jest.Mock;
    };
    let mockHttpService: { post: jest.Mock };

    beforeEach(async () => {
        // Mock Redis client (what getClient() returns)
        mockRedisClient = {
            get: jest.fn(),
        };

        // Mock RedisService (what's injected)
        mockRedisService = {
            getClient: jest.fn().mockReturnValue(mockRedisClient),
        };

        // Mock WordFamilyRepository
        mockRepository = {
            findCategories: jest.fn(),
            createCategory: jest.fn(),
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
});
