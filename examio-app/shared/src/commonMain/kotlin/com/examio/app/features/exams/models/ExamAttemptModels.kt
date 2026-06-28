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

// BE wraps the attempt in an envelope: { message, examAttempt, isResume }
// (examio-be examattempt.service.ts startExamAttempt). The top-level object has
// no `id`, so the body must be parsed as this wrapper, not ExamAttempt directly.
@Serializable
data class StartExamAttemptResponse(
    val message: String? = null,
    val examAttempt: ExamAttempt,
    val isResume: Boolean = false,
)

// Matches server/FE secure-quiz contract (examio-fe/src/apis/examAttemptApi.ts):
// each question carries its own JWT token plus AES-CBC encrypted content.
@Serializable
data class SecureQuestion(
    val index: Int,
    val token: String,
    val question_encrypted: String,
    val options_encrypted: String,
)

@Serializable
data class SecureQuizResponse(
    val attemptId: String,
    val status: Int = 0,
    val currentIndex: Int = 0,
    val answers: Map<String, String> = emptyMap(),
    val markedQuestions: List<String> = emptyList(),
    val totalQuestions: Int = 0,
    val timeLimitMinutes: Int? = null,
    val startedAt: String? = null,
    val questions: List<SecureQuestion>,
)

// Question decrypted client-side, mirrors FE DecryptedQuestion.
data class DecryptedQuestion(
    val index: Int,
    val token: String,
    val question: String,
    val options: List<String>,
)

// Submit payload: one entry per answered question, keyed by its JWT token.
@Serializable
data class SecureAnswer(val token: String, val chosen_option: String)

@Serializable
data class SubmitExamAttemptRequest(val answers: List<SecureAnswer>)

// Progress autosave payload (PUT /examattempts/{id}/progress).
@Serializable
data class UpdateProgressRequest(
    val answers: Map<String, String> = emptyMap(),
    val markedQuestions: List<String> = emptyList(),
    val currentIndex: Int = 0,
)

@Serializable
data class ReviewQuestion(
    val id: String? = null,
    val question: String,
    val options: List<String>,
    val answer: String,
    val userAnswer: String? = null,
)

@Serializable
data class SecureSubmitResponse(
    val message: String? = null,
    val score: Double,
    val totalQuestions: Int,
    val correctAnswers: Int,
    val percentage: Double = 0.0,
    val showAnswers: Boolean = false,
    val passed: Boolean = false,
    val passingScore: Double = 0.0,
    val questions: List<ReviewQuestion>? = null,
)
