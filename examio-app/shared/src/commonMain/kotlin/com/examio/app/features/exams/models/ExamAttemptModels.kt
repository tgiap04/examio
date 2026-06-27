package com.examio.app.features.exams.models

import kotlinx.serialization.Serializable

@Serializable
data class ExamAttempt(
    val id: String,
    val examSessionId: String? = null,
    val score: Double? = null,
    val status: Int = 0,
    val startedAt: String? = null,
    val submittedAt: String? = null,
    val isPinned: Boolean = false,
)

@Serializable
data class RecentExamRoom(
    val id: String,
    val title: String,
    val description: String? = null,
)

@Serializable
data class RecentExamSession(
    val id: String,
    val startTime: String,
    val endTime: String? = null,
    val timeLimitMinutes: Int? = null,
    val showAnswersAfterSubmit: Boolean = false,
    val examRoom: RecentExamRoom,
)

@Serializable
data class RecentExamAttempt(
    val id: String,
    val examSessionId: String,
    val score: Double,
    val violationCount: Int = 0,
    val startedAt: String,
    val finishedAt: String? = null,
    val status: Int,
    val totalQuestions: Int,
    val correctAnswers: Int,
    val timeRemaining: Int? = null,
    val isPinned: Boolean = false,
    val examSession: RecentExamSession,
)

@Serializable
data class RecentExamsResponse(
    val examAttempts: List<RecentExamAttempt>,
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
    val totalPages: Int = 1,
)

@Serializable
data class StartExamAttemptRequest(val examSessionId: String)

@Serializable
data class SecureQuestion(
    val id: String,
    val encryptedPayload: String,
    val iv: String? = null,
)

@Serializable
data class SecureQuizResponse(
    val attemptId: String,
    val questions: List<SecureQuestion>,
    val expiresAt: String? = null,
)

@Serializable
data class SecureAnswer(val questionId: String, val answer: String)

@Serializable
data class SubmitExamAttemptRequest(val answers: List<SecureAnswer>)
