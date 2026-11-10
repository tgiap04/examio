import { HttpException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { aiV1 } from '@examio/contracts';
import { isGrpcUnavailable } from '@examio/grpc';
import { RedisService } from '@examio/redis';
import { AiClient } from '../../clients/ai.client';
import { MODEL_CATALOG_CACHE_KEY, MODEL_CATALOG_CACHE_SECONDS } from './generation.constants';

interface ModelEntry {
    id: string;
    name: string;
    description: string;
    provider: string;
    runtimeModelName: string;
    badge: string;
    disabled: boolean;
    available: boolean;
    availabilityReason?: string;
    isDefault: boolean;
    supportsStructuredOutput: boolean;
    specs: Array<{ label: string; value: string }>;
}

export interface ModelCatalog {
    embeddingModel?: ModelEntry;
    generationModels: ModelEntry[];
    defaultGenerationModel: string;
}

const toEntry = (model: aiV1.ModelInfo): ModelEntry => ({
    id: model.id,
    name: model.name,
    description: model.description,
    provider: model.provider,
    runtimeModelName: model.runtimeModelName,
    badge: model.badge,
    disabled: model.disabled,
    available: model.available,
    ...(model.availabilityReason ? { availabilityReason: model.availabilityReason } : {}),
    isDefault: model.isDefault,
    supportsStructuredOutput: model.supportsStructuredOutput,
    specs: model.specs.map((spec) => ({ label: spec.label, value: spec.value })),
});

/** `GET /ai/models`: ai-service's live catalog (cached 10 minutes), or a disabled placeholder while it is down. */
@Injectable()
export class ModelCatalogService {
    private readonly logger = new Logger(ModelCatalogService.name);

    constructor(
        private readonly ai: AiClient,
        private readonly redis: RedisService
    ) {}

    async getCatalog(): Promise<ModelCatalog> {
        const cached = await this.readCache();
        if (cached) return cached;
        try {
            const response = await this.ai.listModels();
            const catalog: ModelCatalog = {
                ...(response.embeddingModel ? { embeddingModel: toEntry(response.embeddingModel) } : {}),
                generationModels: response.generationModels.map(toEntry),
                defaultGenerationModel: response.defaultGenerationModel,
            };
            await this.writeCache(catalog);
            return catalog;
        } catch (error) {
            if (error instanceof HttpException) throw error;
            if (!isGrpcUnavailable(error)) {
                this.logger.error(`Failed to fetch the model catalog: ${(error as Error).message}`);
                throw new InternalServerErrorException('Không thể lấy danh sách model AI');
            }
            this.logger.warn(`AI service model catalog unavailable, using the fallback catalog: ${(error as Error).message}`);
            return this.fallbackCatalog();
        }
    }

    private defaultModelId(): string {
        const configured = process.env.AI2_DEFAULT_MODEL?.trim();
        return configured || this.configuredModelIds()[0] || '';
    }

    private configuredModelIds(): string[] {
        return (process.env.AI2_GENERATION_MODEL_NAMES || '')
            .split(',')
            .map((model) => model.trim())
            .filter(Boolean);
    }

    /** Same placeholder the HTTP client gave while ai-service was unreachable: every model disabled. */
    private fallbackCatalog(): ModelCatalog {
        const reason = 'AI service chưa sẵn sàng. Vui lòng khởi động AI service rồi thử lại.';
        const defaultId = this.defaultModelId();
        const ids = Array.from(new Set([defaultId, ...this.configuredModelIds()].filter(Boolean)));
        const generationModels: ModelEntry[] = ids.map((id, index) => ({
            id,
            name: id.replace(/[-.]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
            description: 'AI2 OpenAI-compatible model dùng cho sinh quiz và flashcard.',
            provider: 'ai2',
            runtimeModelName: id,
            badge: id === defaultId ? 'Mặc định' : 'AI2',
            disabled: true,
            available: false,
            availabilityReason: reason,
            isDefault: id === defaultId || (index === 0 && !ids.includes(defaultId)),
            supportsStructuredOutput: false,
            specs: [
                { label: 'Trạng thái', value: 'AI service offline' },
                { label: 'Provider', value: 'AI2' },
                { label: 'Runtime', value: id },
            ],
        }));
        return {
            embeddingModel: {
                id: 'gemini_embedding',
                name: 'Gemini Embedding',
                description: 'Embedding model dùng chung cho hệ thống.',
                provider: 'gemini',
                runtimeModelName: 'models/text-embedding-004',
                badge: 'Offline',
                disabled: true,
                available: false,
                availabilityReason: reason,
                isDefault: true,
                supportsStructuredOutput: false,
                specs: [
                    { label: 'Trạng thái', value: 'AI service offline' },
                    { label: 'Provider', value: 'Google' },
                ],
            },
            generationModels,
            defaultGenerationModel: generationModels.find((model) => model.isDefault)?.id || defaultId,
        };
    }

    private async readCache(): Promise<ModelCatalog | null> {
        try {
            return await this.redis.get<ModelCatalog>(MODEL_CATALOG_CACHE_KEY);
        } catch (error) {
            this.logger.warn(`Model catalog cache read failed: ${(error as Error).message}`);
            return null;
        }
    }

    private async writeCache(catalog: ModelCatalog): Promise<void> {
        try {
            await this.redis.set(MODEL_CATALOG_CACHE_KEY, catalog, MODEL_CATALOG_CACHE_SECONDS);
        } catch (error) {
            this.logger.warn(`Model catalog cache write failed: ${(error as Error).message}`);
        }
    }
}
