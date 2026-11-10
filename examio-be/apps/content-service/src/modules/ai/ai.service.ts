import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import type { AuthUser } from '@examio/auth-jwt';
import { DocumentClient, requireUserToken, rethrowAsDocumentHttp, userMetadata } from '@examio/grpc';
import { processingStatusName } from './document-mapper';
import { ChargeRefusedException, ChargeUnknownException, GenerationJobService, GenerationOptions } from './generation-job.service';
import { GenerationJobRepository } from './generation-job.repository';
import { GenerationLockService } from './generation-lock.service';
import {
    DEFAULT_GENERATE_ITEMS,
    chargePlan,
    generationTypeOf,
    needsReprocessing,
    parseGenerateQuantity,
    regenerateCredits,
} from './generation-request-rules';
import { GenerationType, MAX_GENERATE_FILE_BYTES } from './generation.constants';
import { GenerateFromFileDto, RegenerateDto } from './dto/ai.dto';

export interface GenerationStarted {
    jobId: string;
    status: string;
    message: string;
    newBalance?: number;
}

/** What `generate-from-file` tells the user it started. */
function generateFromFileMessage(reused: boolean, reprocessing: boolean): string {
    if (!reused) return 'File đã được upload, đang xử lý OCR và tạo nội dung';
    return reprocessing ? 'Đang xử lý lại file cũ...' : 'File đã tồn tại, đang tạo nội dung mới...';
}

/** HTTP-facing generation flows. Money and queueing live in `GenerationJobService`. */
@Injectable()
export class AIService {
    private readonly logger = new Logger(AIService.name);

    constructor(
        private readonly documents: DocumentClient,
        private readonly generation: GenerationJobService,
        private readonly jobs: GenerationJobRepository,
        private readonly locks: GenerationLockService
    ) {}

    /** Upload (or reuse) the file in document-service, charge once, queue the generation. Returns at once. */
    async generateFromFile(
        user: AuthUser,
        file: Express.Multer.File,
        dto: GenerateFromFileDto,
        userToken?: string
    ): Promise<GenerationStarted> {
        if (!file || !file.buffer) throw new BadRequestException('No file provided');
        if (file.size > MAX_GENERATE_FILE_BYTES) {
            throw new BadRequestException(
                `File quá lớn. Tối đa 5MB, file của bạn: ${(file.size / (1024 * 1024)).toFixed(2)}MB`
            );
        }
        const token = requireUserToken(userToken);
        const metadata = userMetadata(token);
        const type = generationTypeOf(dto.typeResult);
        const quizItems = parseGenerateQuantity(dto.quantityQuizz, 'câu hỏi quiz');
        const flashcardItems = parseGenerateQuantity(dto.quantityFlashcard, 'flashcard');
        const options: GenerationOptions = {
            numItems: type === 'flashcard' ? flashcardItems : quizItems,
            isNarrowSearch: dto.isNarrowSearch === 'true',
            keyword: dto.keyword?.trim() || undefined,
        };

        await this.locks.acquire(user.id, type);
        let createdDocumentId: string | undefined;
        try {
            const upload = await this.documents
                .createUpload(
                    {
                        filename: file.originalname,
                        mimetype: file.mimetype,
                        data: file.buffer,
                        chargeCredits: false,
                        reuseDuplicate: true,
                    },
                    metadata
                )
                .catch(rethrowAsDocumentHttp);
            const doc = upload.document;
            if (!doc) throw new NotFoundException('Upload không tồn tại');
            if (!upload.reused) createdDocumentId = doc.id;

            if (upload.reused && processingStatusName(doc) === 'PROCESSING') {
                const running = await this.jobs.activeByStorage(doc.id, user.id, type);
                if (running) {
                    await this.locks.release(user.id, type);
                    return { jobId: running.id, status: 'processing', message: 'File này đang được xử lý, vui lòng chờ hoàn tất.' };
                }
            }

            const plan = chargePlan(doc, upload.reused);
            if (plan.ensureProcessed) await this.ensureProcessed(doc.id, metadata);
            const download = await this.signedDownload(doc, metadata);

            const submitted = await this.generation.submit({
                userId: user.id,
                userToken: token,
                storageId: doc.id,
                filename: doc.filename,
                type,
                options,
                model: dto.modelType,
                amount: plan.amount,
                reason: `Generate from ${upload.reused ? 'EXISTING ' : ''}file: ${doc.filename}`,
                download,
            });
            return {
                jobId: submitted.jobId,
                status: upload.reused ? 'processing' : 'PENDING',
                message: generateFromFileMessage(upload.reused, plan.ensureProcessed),
                newBalance: submitted.newBalance,
            };
        } catch (error) {
            await this.locks.release(user.id, type);
            // The file was stored for this request only and the charge was refused (or its outcome is unknown, the
            // reaper settles the job): do not keep an upload the user did not pay for.
            if ((error instanceof ChargeRefusedException || error instanceof ChargeUnknownException) && createdDocumentId) {
                await this.discardDocument(createdDocumentId, metadata);
            }
            throw error;
        }
    }

    /** New generation (and a new charge) from a document the caller already uploaded. */
    async regenerate(uploadId: string, user: AuthUser, dto: RegenerateDto, userToken?: string): Promise<GenerationStarted> {
        const token = requireUserToken(userToken);
        const metadata = userMetadata(token);
        const [doc] = await this.documents.getDocumentsByIds([uploadId], metadata).catch(rethrowAsDocumentHttp);
        if (!doc) throw new NotFoundException('Upload không tồn tại');

        const type: GenerationType =
            generationTypeOf(dto.typeResult) === 'flashcard' || dto.outputType === 'flashcard' ? 'flashcard' : 'quiz';
        const numItems =
            (type === 'flashcard' ? dto.quantityFlashcard : dto.quantityQuizz) || dto.count || DEFAULT_GENERATE_ITEMS;
        const options: GenerationOptions = {
            numItems,
            isNarrowSearch: dto.isNarrowSearch ?? false,
            keyword: dto.keyword?.trim() || undefined,
        };

        await this.locks.acquire(user.id, type);
        try {
            if (needsReprocessing(doc)) await this.ensureProcessed(doc.id, metadata);
            const submitted = await this.generation.submit({
                userId: user.id,
                userToken: token,
                storageId: doc.id,
                filename: doc.filename,
                type,
                options,
                model: dto.modelType,
                amount: regenerateCredits(numItems),
                reason: `Generate ${numItems} ${type}s from file ${doc.filename}`,
                download: await this.signedDownload(doc, metadata),
            });
            return {
                jobId: submitted.jobId,
                status: 'processing',
                newBalance: submitted.newBalance,
                message: type === 'flashcard' ? 'Đang tạo flashcard mới...' : 'Đang tạo câu hỏi trắc nghiệm mới...',
            };
        } catch (error) {
            await this.locks.release(user.id, type);
            throw error;
        }
    }

    /**
     * A presigned GET handed to ai-service with the request, so it can process a document that has no chunks
     * yet instead of waiting for the OCR pipeline. Best effort: without it ai-service falls back to waiting.
     */
    private async signedDownload(
        doc: { id: string; mimetype: string },
        metadata: Metadata
    ): Promise<{ url: string; mimetype: string } | undefined> {
        try {
            const { downloadUrl } = await this.documents.getDownloadUrl(doc.id, metadata);
            return downloadUrl ? { url: downloadUrl, mimetype: doc.mimetype } : undefined;
        } catch (error) {
            this.logger.warn(`No download URL for document ${doc.id}, generation waits for the OCR: ${(error as Error).message}`);
            return undefined;
        }
    }

    private async ensureProcessed(id: string, metadata: Metadata): Promise<void> {
        await this.documents.ensureProcessed(id, metadata).catch(rethrowAsDocumentHttp);
    }

    /** Best effort: a leftover free upload is harmless, a failed cleanup must not hide the refusal. */
    private async discardDocument(id: string, metadata: Metadata): Promise<void> {
        try {
            await this.documents.deleteDocuments([id], metadata);
        } catch (error) {
            this.logger.error(`Could not delete the refused upload ${id}: ${(error as Error).message}`);
        }
    }
}
