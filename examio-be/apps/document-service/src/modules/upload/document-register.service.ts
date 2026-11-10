import { Injectable } from '@nestjs/common';
import { GenerateIdService, ownedR2Key } from '@examio/common';
import { PrismaService, UserStorage } from '../../prisma';
import { AI_UPLOAD_AREAS, DocumentStatus } from '../../config/document.constants';
import { DocumentChargeService } from './document-charge.service';
import { DocumentErrorCode, documentError } from './document-errors';
import { DocumentProcessingService } from './document-processing.service';
import { DocumentQueryService } from './document-query.service';
import { DocumentRepository } from './document.repository';
import type { RegisterUploadDto } from './dto/upload.dto';

/** `POST /ai/upload`: registers an object the client already stored in R2 under its own key, then charges it. */
@Injectable()
export class DocumentRegisterService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly repo: DocumentRepository,
        private readonly query: DocumentQueryService,
        private readonly charge: DocumentChargeService,
        private readonly processing: DocumentProcessingService,
        private readonly ids: GenerateIdService
    ) {}

    async register(userId: string, dto: RegisterUploadDto, userToken?: string) {
        if (!ownedR2Key(dto.keyR2, AI_UPLOAD_AREAS, userId)) {
            throw documentError(400, DocumentErrorCode.VALIDATION_FAILED, 'keyR2 không hợp lệ');
        }
        const existing = await this.repo.findByKey(dto.keyR2);
        if (existing) return this.resume(existing, userId, userToken);

        await this.query.enforceQuota(userId);
        let doc: UserStorage;
        try {
            doc = await this.repo.insert(this.prisma, {
                id: this.ids.generateId(),
                userId,
                filename: dto.filename,
                url: dto.url,
                mimetype: dto.mimetype,
                size: dto.size,
                keyR2: dto.keyR2,
                processingStatus: DocumentStatus.PENDING_CHARGE,
            });
        } catch (error) {
            // Lost a race on the unique key: the winner's row is the one to continue.
            if ((error as { code?: string })?.code !== 'P2002') throw error;
            const winner = await this.repo.findByKey(dto.keyR2);
            if (!winner) throw error;
            return this.resume(winner, userId, userToken);
        }
        const { newBalance } = await this.charge.chargeAndQueue(doc, userToken);
        return this.registered(doc.id, DocumentStatus.PENDING, newBalance);
    }

    /** A second `POST /ai/upload` for the same key is the same upload: same id, never a second debit. */
    private async resume(existing: UserStorage, userId: string, userToken?: string) {
        if (existing.userId !== userId) {
            throw documentError(409, DocumentErrorCode.STORAGE_KEY_TAKEN, 'Khóa lưu trữ đã tồn tại');
        }
        if (existing.chargeFailedAt) {
            throw documentError(409, DocumentErrorCode.STORAGE_KEY_TAKEN, 'Upload trước đó đã thất bại, vui lòng tải lại file.');
        }
        if (existing.processingStatus === DocumentStatus.PENDING_CHARGE) {
            const { newBalance } = await this.charge.chargeAndQueue(existing, userToken);
            return this.registered(existing.id, DocumentStatus.PENDING, newBalance);
        }
        const current =
            existing.processingStatus === DocumentStatus.FAILED
                ? await this.processing.ensureProcessed(userId, existing.id)
                : existing;
        return this.registered(current.id, current.processingStatus);
    }

    private registered(id: string, status: string, newBalance?: number) {
        return { id, status, newBalance, message: 'File đã được upload, đang xử lý OCR' };
    }
}
