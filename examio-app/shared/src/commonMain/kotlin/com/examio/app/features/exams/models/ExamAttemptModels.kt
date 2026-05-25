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
