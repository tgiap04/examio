import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';
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
     */
    getPublicUrl(key: string): string {
        return `${r2Config.publicBaseUrl}/${key}`;
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
     */
    async listFiles(directory?: string, maxKeys: number = 1000) {
        const res = await this.s3.send(
            new ListObjectsV2Command({
                Bucket: r2Config.bucket,
                Prefix: directory,
                MaxKeys: maxKeys,
            })
        );

        return (
            res.Contents?.map((item) => ({
                key: item.Key!,
                size: item.Size!,
                lastModified: item.LastModified!,
                url: this.getPublicUrl(item.Key!),
            })) || []
        );
    }

    /**
     * Xóa nhiều files trong một directory
     */
    async deleteDirectory(directory: string): Promise<number> {
        const files = await this.listFiles(directory);
        await Promise.all(files.map((file) => this.deleteFile(file.key)));
        return files.length;
    }
}
