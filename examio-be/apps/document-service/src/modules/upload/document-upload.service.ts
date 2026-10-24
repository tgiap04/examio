import { Injectable, Logger } from '@nestjs/common';
import { GenerateIdService, ownedR2Key, ownerKeyFolder, sanitizeFilename } from '@examio/common';
import { R2DeleteTaskWriter } from '@examio/messaging';
import { PrismaService, UserStorage } from '../../prisma';
import { R2Client } from '../../clients/r2.client';
import { AI_UPLOAD_AREAS, DocumentStatus, MAX_UPLOAD_BYTES } from '../../config/document.constants';
import { DocumentChargeService } from './document-charge.service';
import { DocumentErrorCode, documentError } from './document-errors';
import { DocumentQueryService } from './document-query.service';
import { DocumentRepository } from './document.repository';

export interface UploadBytes {
    filename: string;
    mimetype: string;
    data: Buffer;
}

export interface UploadBytesOptions {
    /** Debit `ceil(sizeMB/2)` (`doc:<id>`) and queue OCR; false = the caller charges itself. */
    chargeCredits: boolean;
    /** Return the caller's existing `(filename, size)` upload instead of storing again. */
    reuseDuplicate: boolean;
}

export interface UploadOutcome {
    document: UserStorage;
    reused: boolean;
    newBalance?: number;
}

const storageUnavailable = () =>
    documentError(500, DocumentErrorCode.STORAGE_UNAVAILABLE, 'Không thể tải file lên lưu trữ, vui lòng thử lại.');

/** Accepting files: R2 object, row, and (for charged uploads) the 3-step debit. */
@Injectable()
export class DocumentUploadService {
    private readonly logger = new Logger(DocumentUploadService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly repo: DocumentRepository,
        private readonly query: DocumentQueryService,
        private readonly charge: DocumentChargeService,
        private readonly r2: R2Client,
        private readonly r2Deletes: R2DeleteTaskWriter,
        private readonly ids: GenerateIdService
    ) {}

    /** `POST /ai/quick-upload`: never charged, no OCR until the first chat message. */
    async quick(userId: string, file: UploadBytes) {
        await this.query.enforceQuota(userId);
        const stored = await this.store('ai-teacher', userId, file);
        const doc = await this.discardOnFailure(userId, stored.keyR2, () =>
            this.repo.insert(this.prisma, {
                ...this.newRow(userId, file, stored),
                processingStatus: DocumentStatus.PENDING,
            })
        );
        return { success: true, userStorageId: doc.id, filename: doc.filename, url: doc.url };
    }

    /** gRPC `CreateUpload`: the bytes arrive over gRPC; OCR is queued with the row. */
    async createFromBytes(
        userId: string,
        file: UploadBytes,
        options: UploadBytesOptions,
        userToken?: string
    ): Promise<UploadOutcome> {
        if (options.reuseDuplicate) {
            const dup = await this.repo.findDuplicate(userId, file.filename, file.data.length);
            if (dup) return { document: dup, reused: true };
        }
        await this.query.enforceQuota(userId);
        const stored = await this.store('ai-uploads', userId, file);
        const base = this.newRow(userId, file, stored);

        if (options.chargeCredits) {
            const doc = await this.discardOnFailure(userId, stored.keyR2, () =>
                this.repo.insert(this.prisma, { ...base, processingStatus: DocumentStatus.PENDING_CHARGE })
            );
            const { newBalance } = await this.charge.chargeAndQueue(doc, userToken);
            const fresh = (await this.repo.findRaw(this.prisma, doc.id)) ?? doc;
            return { document: fresh, reused: false, newBalance };
        }

        // The caller charges itself: row and `document.uploaded` commit together.
        const downloadUrl = await this.discardOnFailure(userId, stored.keyR2, () =>
            this.charge.downloadUrl({ keyR2: stored.keyR2 })
        );
        const doc = await this.discardOnFailure(userId, stored.keyR2, () =>
            this.prisma.$transaction(async (tx) => {
                const row = await this.repo.insert(tx, {
                    ...base,
                    processingStatus: DocumentStatus.PENDING,
                    queuedAt: new Date(),
                });
                await this.charge.recordUploaded(tx, row, downloadUrl);
                return row;
            })
        );
        return { document: doc, reused: false };
    }

    private newRow(userId: string, file: UploadBytes, stored: { keyR2: string; url: string }) {
        return {
            id: this.ids.generateId(),
            userId,
            filename: file.filename,
            url: stored.url,
            mimetype: file.mimetype,
            size: file.data.length,
            keyR2: stored.keyR2,
        };
    }

    private async store(area: (typeof AI_UPLOAD_AREAS)[number], userId: string, file: UploadBytes) {
        if (file.data.length === 0 || file.data.length > MAX_UPLOAD_BYTES) {
            throw documentError(400, DocumentErrorCode.VALIDATION_FAILED, 'File rỗng hoặc vượt quá 50MB');
        }
        const name = `${Date.now()}-${sanitizeFilename(file.filename)}`;
        try {
            const keyR2 = await this.r2.uploadFile(name, file.data, file.mimetype, ownerKeyFolder(area, userId));
            return { keyR2, url: this.r2.getPublicUrl(keyR2) };
        } catch (error) {
            this.logger.error(`R2 upload failed: ${(error as Error).message}`);
            throw storageUnavailable();
        }
    }

    /** Runs `step`; when it fails the already-stored object is queued for deletion (best effort). */
    private async discardOnFailure<T>(userId: string, keyR2: string, step: () => Promise<T>): Promise<T> {
        try {
            return await step();
        } catch (error) {
            try {
                await this.prisma.$transaction((tx) =>
                    this.r2Deletes.enqueue(tx, [ownedR2Key(keyR2, AI_UPLOAD_AREAS, userId)])
                );
            } catch (enqueueError) {
                this.logger.error(`Orphaned R2 object ${keyR2}: ${(enqueueError as Error).message}`);
            }
            throw error;
        }
    }
}
