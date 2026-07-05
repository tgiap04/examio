package com.examio.app.features.ai.models

import kotlinx.serialization.Serializable

// jobId returned when AI generation is queued — poll with AiJobPoller
@Serializable
data class GenerateJobResponse(
    val jobId: String,
    val newBalance: Int? = null,
)

@Serializable
data class JobStatus(
    val jobId: String,
    val status: String,        // backend: pending | processing | completed | failed (matched case-insensitively)
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
    // Generated content returned inline by the backend on a completed job.
    val quizzes: List<GeneratedQuiz>? = null,
    val flashcards: List<GeneratedFlashcard>? = null,
)

@Serializable
data class GeneratedQuiz(
    val question: String,
    val options: List<String> = emptyList(),
    val answer: String,
)

@Serializable
data class GeneratedFlashcard(
    val question: String,
    val answer: String,
)

@Serializable
data class JobFileInfo(
    val id: String,
    val filename: String,
)
