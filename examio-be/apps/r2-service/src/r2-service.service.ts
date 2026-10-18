import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException, Injectable } from '@nestjs/common';
import { r2Config } from './config/r2.config';

@Injectable()
export class R2ServiceService {
    private s3: S3Client;

    constructor() {
        this.s3 = new S3Client({
            region: r2Config.region,
            endpoint: r2Config.endpoint,
            credentials: {
                accessKeyId: r2Config.credentials.accessKeyId ?? '',
                secretAccessKey: r2Config.credentials.secretAccessKey ?? '',
            },
        });
    }

    private sanitizePathPart(value: string, label: string): string {
        const normalized = value.replace(/\\/g, '/').split('/').pop()?.trim();
        if (!normalized || normalized.includes('..') || /[\x00-]/.test(normalized)) {
            throw new BadRequestException(`Invalid ${label}`);
        }
        return normalized.replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    private sanitizeDirectory(directory: string): string {
        const parts = directory
            .replace(/\\/g, '/')
            .split('/')
            .filter(Boolean)
            .map((part) => this.sanitizePathPart(part, 'directory'));

        if (!parts.length) {
            throw new BadRequestException('Invalid directory');
        }

        return parts.join('/');
    }

    /**
     * Upload file với hỗ trợ directory/folder
     */
    async uploadFile(
        key: string,
        buffer: Buffer,
        mimetype: string,
        directory?: string
    ): Promise<string> {
        const safeKey = this.sanitizePathPart(key, 'file key');
        const fullKey = directory
            ? `${this.sanitizeDirectory(directory)}/${safeKey}`
            : safeKey;

        await this.s3.send(
            new PutObjectCommand({
                Bucket: r2Config.bucket,
                Key: fullKey,
                Body: buffer,
                ContentType: mimetype,
            })
        );

        return fullKey;
    }

    /**
     * Lấy public URL của file
     *
     * Chỉ nên dùng cho asset công khai (avatar, thumbnail, ...). Với private
     * content, dùng getSignedUrl/resolveUrl để tránh lộ key qua URL vĩnh viễn.
     */
    getPublicUrl(key: string): string {
        return `${r2Config.publicBaseUrl}/${key}`;
    }

    /**
     * Tạo presigned URL có thời hạn cho file private.
     *
     * Tradeoff: URL này hết hạn sau `expiresIn` giây (mặc định 1 giờ), nên
     * client không thể hotlink vĩnh viễn — mỗi lần cần truy cập lại phải gọi
     * API để lấy URL mới. Đổi lại, key thật sự không bị lộ công khai.
     */
    async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
        // `@aws-sdk/s3-request-presigner` resolves its own nested copy of
        // `@smithy/types` (version drift vs. the one `@aws-sdk/client-s3`
        // uses), so the two packages' `Client`/`Command` types are
        // structurally near-identical but not nominally assignable. Runtime
        // behavior is unaffected (both are plain S3Client/Command instances);
        // the cast only works around this dual-package type mismatch.
        return getSignedUrl(
            this.s3 as unknown as Parameters<typeof getSignedUrl>[0],
            new GetObjectCommand({
                Bucket: r2Config.bucket,
                Key: key,
            }) as unknown as Parameters<typeof getSignedUrl>[1],
            { expiresIn }
        );
    }

    /**
     * Kiểm tra key có thuộc private prefix (ai-uploads, ai-teacher, documents, ...)
     * hay không. Danh sách prefix được cấu hình qua env R2_PRIVATE_PREFIXES.
     */
    private isPrivateKey(key: string): boolean {
        return r2Config.privatePrefixes.some(
            (prefix) => key === prefix || key.startsWith(`${prefix}/`)
        );
    }

    /**
     * Resolve URL phù hợp cho một key: presigned URL (hết hạn) cho private
     * content, public URL (vĩnh viễn) cho asset công khai.
     */
    async resolveUrl(key: string, expiresIn = 3600): Promise<string> {
        if (this.isPrivateKey(key)) {
            return this.getSignedUrl(key, expiresIn);
        }
        return this.getPublicUrl(key);
    }

    /**
     * Lấy file từ R2
     */
    async getFile(key: string) {
        const res = await this.s3.send(
            new GetObjectCommand({
                Bucket: r2Config.bucket,
                Key: key,
            })
        );
        return res.Body;
    }

    /**
     * Xóa file từ R2
     */
    async deleteFile(key: string): Promise<void> {
        await this.s3.send(
            new DeleteObjectCommand({
                Bucket: r2Config.bucket,
                Key: key,
            })
        );
    }

    /**
     * List files trong một directory
     *
     * Phân trang qua toàn bộ object trong prefix bằng ContinuationToken —
     * `maxKeys` chỉ là kích thước mỗi trang gọi tới S3, không còn là giới hạn
     * tổng số kết quả trả về (tránh under-listing khi directory có >1000 object).
     */
    async listFiles(directory?: string, maxKeys: number = 1000) {
        const items: {
            key: string;
            size: number;
            lastModified: Date;
            url: string;
        }[] = [];
        let continuationToken: string | undefined;

        do {
            const res = await this.s3.send(
                new ListObjectsV2Command({
                    Bucket: r2Config.bucket,
                    Prefix: directory,
                    MaxKeys: maxKeys,
                    ContinuationToken: continuationToken,
                })
            );

            for (const item of res.Contents ?? []) {
                items.push({
                    key: item.Key!,
                    size: item.Size!,
                    lastModified: item.LastModified!,
                    url: this.getPublicUrl(item.Key!),
                });
            }

            continuationToken = res.IsTruncated
                ? res.NextContinuationToken
                : undefined;
        } while (continuationToken);

        return items;
    }

    /**
     * Xóa nhiều files trong một directory
     *
     * Dùng DeleteObjectsCommand để batch-delete tối đa 1000 key/lần thay vì
     * một DeleteObjectCommand cho mỗi object (giảm số round-trip HTTP tới R2).
     * `listFiles` đã phân trang nên danh sách này bao gồm TOÀN BỘ object
     * trong directory, kể cả khi vượt quá 1000 object.
     */
    async deleteDirectory(directory: string): Promise<number> {
        const files = await this.listFiles(directory);
        return this.deleteObjects(files.map((file) => file.key));
    }

    /**
     * Batch-delete theo key (tối đa 1000 key/lần). Idempotent: R2/S3 coi key
     * không tồn tại là đã xóa nên gọi lại với cùng danh sách vẫn thành công.
     * Lỗi theo từng key (AccessDenied, ...) được ném ra để caller retry —
     * không bao giờ báo thành công giả.
     */
    async deleteObjects(keys: string[]): Promise<number> {
        const chunkSize = 1000;
        let deleted = 0;
        for (let i = 0; i < keys.length; i += chunkSize) {
            const chunk = keys.slice(i, i + chunkSize);
            const result = await this.s3.send(
                new DeleteObjectsCommand({
                    Bucket: r2Config.bucket,
                    Delete: {
                        Objects: chunk.map((Key) => ({ Key })),
                    },
                })
            );
            if (result?.Errors?.length) {
                const first = result.Errors[0];
                throw new Error(
                    `DeleteObjects failed for ${result.Errors.length} key(s): ${first.Code ?? 'Unknown'}`
                );
            }
            // S3/R2 report already-missing keys as Deleted, so repeats still count.
            deleted += result?.Deleted?.length ?? chunk.length;
        }
        return deleted;
    }
}
