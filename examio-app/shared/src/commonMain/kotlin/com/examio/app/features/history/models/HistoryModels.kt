package com.examio.app.features.history.models

import kotlinx.serialization.Serializable

@Serializable
data class HistoryStats(
    val totalPdfs: Int = 0,
    val totalExams: Int = 0,
    val totalFlashcards: Int = 0,
    val completedAttempts: Int = 0,
)

@Serializable
data class PDFHistoryItem(
    val id: String,
    val filename: String,
    val processingStatus: String,
    val createdAt: String? = null,
)

@Serializable
data class ExamHistoryItem(
    val id: String,
    val title: String,
    val score: Double? = null,
    val status: Int = 0,
    val createdAt: String? = null,
)
