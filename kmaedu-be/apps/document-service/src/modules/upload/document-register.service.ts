import { Injectable } from '@nestjs/common';
import { GenerateIdService, ownedR2Key } from '@kmaedu/common';
import { PrismaService, UserStorage } from '../../prisma';
import { AI_UPLOAD_AREAS, DocumentStatus } from '../../config/document.constants';
import { DocumentErrorCode, documentError } from './document-errors';
import { DocumentProcessingService } from './document-processing.service';
import { DocumentQueueService } from './document-queue.service';
import { DocumentRepository } from './document.repository';
import type { RegisterUploadDto } from './dto/upload.dto';

/** `POST /ai/upload`: registers an object the client already stored in R2 under its own key, then queues its OCR. */
@Injectable()
export class DocumentRegisterService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly repo: DocumentRepository,
        private readonly queue: DocumentQueueService,
        private readonly processing: DocumentProcessingService,
        private readonly ids: GenerateIdService
    ) {}

    async register(userId: string, dto: RegisterUploadDto) {
        if (!ownedR2Key(dto.keyR2, AI_UPLOAD_AREAS, userId)) {
            throw documentError(400, DocumentErrorCode.VALIDATION_FAILED, 'keyR2 không hợp lệ');
        }
        const existing = await this.repo.findByKey(dto.keyR2);
        if (existing) return this.resume(existing, userId);

        // Signed before the row exists: an r2 outage answers 503 and the client simply registers again.
        const downloadUrl = await this.queue.downloadUrl({ keyR2: dto.keyR2 });
        let doc: UserStorage;
        try {
            doc = await this.prisma.$transaction(async (tx) => {
                const row = await this.repo.insert(tx, {
                    id: this.ids.generateId(),
                    userId,
                    filename: dto.filename,
                    url: dto.url,
                    mimetype: dto.mimetype,
                    size: dto.size,
                    keyR2: dto.keyR2,
                    processingStatus: DocumentStatus.PENDING,
                    queuedAt: new Date(),
                });
                await this.queue.recordUploaded(tx, row, downloadUrl);
                return row;
            });
        } catch (error) {
            // Lost a race on the unique key: the winner's row is the one to continue.
            if ((error as { code?: string })?.code !== 'P2002') throw error;
            const winner = await this.repo.findByKey(dto.keyR2);
            if (!winner) throw error;
            return this.resume(winner, userId);
        }
        return this.registered(doc.id, doc.processingStatus);
    }

    /** A second `POST /ai/upload` for the same key is the same upload: same id; a FAILED one is re-queued. */
    private async resume(existing: UserStorage, userId: string) {
        if (existing.userId !== userId) {
            throw documentError(409, DocumentErrorCode.STORAGE_KEY_TAKEN, 'Khóa lưu trữ đã tồn tại');
        }
        const current =
            existing.processingStatus === DocumentStatus.FAILED
                ? await this.processing.ensureProcessed(userId, existing.id)
                : existing;
        return this.registered(current.id, current.processingStatus);
    }

    private registered(id: string, status: string) {
        return { id, status, message: 'File đã được upload, đang xử lý OCR' };
    }
}
