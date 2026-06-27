package com.examio.app.features.history.models

import kotlinx.serialization.Serializable

@Serializable
data class HistoryStats(
    val totalPDFs: Int = 0,
    val examsCreated: Int = 0,
    val flashcardSets: Int = 0,
    val totalStudyHours: Int = 0,
)

@Serializable
data class PDFHistoryItem(
    val id: String,
    val filename: String,
    val url: String? = null,
    val size: Long? = null,
    val mimetype: String? = null,
    val processingStatus: String = "PENDING",
    val createdAt: String? = null,
    val quizHistory: PDFQuizHistory? = null,
    val flashcardHistory: PDFFlashcardHistory? = null,
)

@Serializable
data class PDFQuizHistory(
    val id: String,
    val createdAt: String,
    val quizCount: Int,
)

@Serializable
data class PDFFlashcardHistory(
    val id: String,
    val createdAt: String,
    val flashcardCount: Int,
)

@Serializable
data class ExamHistoryItem(
    val id: String,
    val examSessionId: String? = null,
    val score: Double? = null,
    val totalQuestions: Int = 0,
    val correctAnswers: Int = 0,
    val startedAt: String? = null,
    val finishedAt: String? = null,
    val status: Int = 0,
    val examSession: ExamSessionSummary? = null,
)

@Serializable
data class ExamSessionSummary(
    val id: String,
    val startTime: String? = null,
    val endTime: String? = null,
    val examRoom: ExamRoomSummary? = null,
)

@Serializable
data class ExamRoomSummary(
    val id: String,
    val title: String,
    val quizSet: QuizSetSummary? = null,
)

@Serializable
data class QuizSetSummary(
    val id: String,
    val title: String,
    val thumbnail: String? = null,
)

@Serializable
data class ExamHistoryResponse(
    val examAttempts: List<ExamHistoryItem> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 10,
    val totalPages: Int = 0,
)
