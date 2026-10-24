import { Injectable, NotFoundException } from '@nestjs/common';
import { documentV1 } from '@examio/contracts';
import type { AuthUser } from '@examio/auth-jwt';
import { DocumentClient, userMetadata } from '../../clients/document.client';
import { rethrowAsDocumentHttp } from '../../clients/document-errors';
import { GenerationJob } from '../../prisma';
import { processingStatusName, toHttpDocument } from './document-mapper';
import { GenerationJobRepository } from './generation-job.repository';
import {
    GENERATION_FAILED_MESSAGE,
    JOB_CANCELLED_MESSAGE,
    JobStatus,
    MODEL_UNAVAILABLE_MESSAGE,
} from './generation.constants';

const uploadNotFound = () => new NotFoundException('Upload không tồn tại');

/** Reasons ai-service reports for a model that cannot serve the request. */
const isModelFailure = (reason: string | null) => !!reason && reason.startsWith('MODEL_');

/** The job status a never-generated document reports for its OCR status; any other status is pending. */
const DOCUMENT_ONLY_JOB_STATUS: Partial<Record<string, string>> = {
    PROCESSING: 'processing',
    COMPLETED: 'completed',
};

/** Reads: job status, the history of a document, and the recent-uploads list. */
@Injectable()
export class GenerationQueryService {
    constructor(
        private readonly jobs: GenerationJobRepository,
        private readonly documents: DocumentClient
    ) {}

    /**
     * `GET job/:jobId`. `jobId` is a GenerationJob id; an id that matches no job is read as a document id
     * (old clients kept the storage id as the job id) and answers with that document's latest job.
     */
    async getJobStatus(jobId: string, user: AuthUser, userToken: string | undefined) {
        const job = await this.findJob(jobId, user);
        if (job) return this.describeJob(job);
        return this.describeDocumentOnly(jobId, userToken);
    }

    /** Resolves a job id (or old-style storage id) of the caller to a job; null when there is none. */
    async findJob(jobId: string, user: AuthUser): Promise<GenerationJob | null> {
        return (await this.jobs.findOwned(jobId, user.id)) ?? (await this.jobs.latestByStorage(jobId, user.id));
    }

    /** `GET upload/:id/history`: the newest quiz and flashcard generated from a document the caller owns. */
    async getUploadHistory(uploadId: string, user: AuthUser, userToken: string | undefined) {
        const doc = await this.ownedDocument(uploadId, userToken);
        const [quiz, flashcard] = await Promise.all([
            this.jobs.latestQuizHistory(doc.id, user.id),
            this.jobs.latestFlashcardHistory(doc.id, user.id),
        ]);
        return {
            uploadId: doc.id,
            filename: doc.filename,
            quizHistory: quiz ? { id: quiz.id, quizzes: quiz.quizzes, createdAt: quiz.createdAt } : null,
            flashcardHistory: flashcard
                ? { id: flashcard.id, flashcards: flashcard.flashcards, createdAt: flashcard.createdAt }
                : null,
        };
    }

    /**
     * `GET recent-uploads`: the caller's documents (one ListDocuments call) with the summary of their latest
     * generated quiz / flashcard (one query for all of them). The array itself, as the FE expects.
     */
    async getRecentUploads(user: AuthUser, page: number, size: number, userToken: string | undefined) {
        const docs = await this.documents
            .listDocuments(page, size, userMetadata(userToken))
            .catch(rethrowAsDocumentHttp);
        const summaries = await this.jobs.historySummaries(
            user.id,
            docs.map((doc) => doc.id)
        );
        const quiz = new Map(summaries.filter((s) => s.kind === 'quiz').map((s) => [s.storageId, s]));
        const flashcard = new Map(summaries.filter((s) => s.kind === 'flashcard').map((s) => [s.storageId, s]));
        return docs.map((doc) => {
            const q = quiz.get(doc.id);
            const f = flashcard.get(doc.id);
            return {
                ...toHttpDocument(doc),
                quizHistory: q ? { id: q.id, createdAt: q.createdAt, quizCount: q.count } : null,
                flashcardHistory: f ? { id: f.id, createdAt: f.createdAt, flashcardCount: f.count } : null,
            };
        });
    }

    private async ownedDocument(id: string, userToken: string | undefined): Promise<documentV1.DocumentInfo> {
        const [doc] = await this.documents
            .getDocumentsByIds([id], userMetadata(userToken))
            .catch(rethrowAsDocumentHttp);
        if (!doc) throw uploadNotFound();
        return doc;
    }

    private async describeJob(job: GenerationJob) {
        const base = { jobId: job.id, filename: job.filename, createdAt: job.createdAt };
        switch (job.status) {
            case JobStatus.COMPLETED:
                return this.describeCompleted(job, base);
            case JobStatus.FAILED:
                return {
                    ...base,
                    status: 'failed',
                    error: isModelFailure(job.error) ? MODEL_UNAVAILABLE_MESSAGE : GENERATION_FAILED_MESSAGE,
                };
            case JobStatus.CANCELLED:
                return { ...base, status: 'failed', error: JOB_CANCELLED_MESSAGE };
            case JobStatus.PENDING_CHARGE:
                return { ...base, status: 'pending' };
            default:
                return { ...base, status: 'processing' };
        }
    }

    private async describeCompleted(job: GenerationJob, base: { jobId: string; filename: string; createdAt: Date }) {
        const fileInfo = { id: job.storageId, filename: job.filename };
        if (job.historyId && job.type === 'flashcard') {
            const history = await this.jobs.findFlashcardHistory(job.historyId);
            if (history) {
                return { jobId: job.id, status: 'completed', result: { type: 'flashcard', flashcards: history.flashcards, historyId: history.id, fileInfo } };
            }
        } else if (job.historyId) {
            const history = await this.jobs.findQuizHistory(job.historyId);
            if (history) {
                return { jobId: job.id, status: 'completed', result: { type: 'quiz', quizzes: history.quizzes, historyId: history.id, fileInfo } };
            }
        }
        return { ...base, status: 'completed', message: 'Tác vụ đã hoàn tất nhưng không tìm thấy kết quả đã tạo.' };
    }

    /** No job at all: an upload the caller owns that was never generated from (its OCR status is the answer). */
    private async describeDocumentOnly(id: string, userToken: string | undefined) {
        const doc = await this.ownedDocument(id, userToken);
        const status = processingStatusName(doc);
        const base = { jobId: doc.id, filename: doc.filename, createdAt: new Date(Number(doc.createdAt)) };
        if (status === 'FAILED') return { ...base, status: 'failed', error: GENERATION_FAILED_MESSAGE };
        return { ...base, status: DOCUMENT_ONLY_JOB_STATUS[status] ?? 'pending' };
    }
}
