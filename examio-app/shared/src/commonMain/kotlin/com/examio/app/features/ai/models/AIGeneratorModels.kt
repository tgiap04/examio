package com.examio.app.features.ai.models

import kotlinx.serialization.Serializable

@Serializable
data class RecentUpload(
    val id: String,
    val filename: String,
    val url: String? = null,
    val size: Long? = null,
    val mimeType: String? = null,
    val processingStatus: String? = null,
    val createdAt: String? = null,
    val quizHistory: RecentUploadQuizSummary? = null,
    val flashcardHistory: RecentUploadFlashcardSummary? = null,
)

@Serializable
data class RecentUploadQuizSummary(
    val id: String,
    val createdAt: String,
    val quizCount: Int,
)

@Serializable
data class RecentUploadFlashcardSummary(
    val id: String,
    val createdAt: String,
    val flashcardCount: Int,
)

// jobId returned when AI generation is queued — poll with AiJobPoller
@Serializable
data class GenerateJobResponse(
    val jobId: String,
    val newBalance: Int? = null,
)

@Serializable
data class JobStatus(
    val jobId: String,
    val status: String,        // PENDING | RUNNING | DONE | FAILED | CANCELLED
    val progress: Int? = null,
    val message: String? = null,
    val error: String? = null,
    val result: JobResult? = null,
)

@Serializable
data class JobResult(
    val type: String,          // "quiz" | "flashcard"
    val historyId: String? = null,
    val fileInfo: JobFileInfo? = null,
)

@Serializable
data class JobFileInfo(
    val id: String,
    val filename: String,
)

@Serializable
data class UploadDetail(
    val id: String,
    val filename: String,
    val url: String? = null,
    val size: Long? = null,
    val mimeType: String? = null,
    val createdAt: String? = null,
    val quizHistories: List<QuizHistoryEntry> = emptyList(),
    val flashcardHistories: List<FlashcardHistoryEntry> = emptyList(),
)

@Serializable
data class QuizHistoryEntry(
    val id: String,
    val createdAt: String,
)

@Serializable
data class FlashcardHistoryEntry(
    val id: String,
    val createdAt: String,
)

@Serializable
data class RegenerateRequest(
    val typeResult: Int,
    val quantityQuizz: Int? = null,
    val quantityFlashcard: Int? = null,
    val isNarrowSearch: Boolean = false,
    val keyword: String? = null,
)
