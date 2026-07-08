package com.examio.app.features.exams.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class QuizSetSummary(
    val id: String,
    val title: String,
    val description: String? = null,
)

@Serializable
data class HostSummary(
    val id: String,
    val name: String? = null,
    val email: String? = null,
)

@Serializable
data class ExamRoomCount(
    val examSessions: Int = 0,
)

@Serializable
data class ExamRoom(
    val id: String,
    val title: String,
    val description: String? = null,
    val quizSetId: String? = null,
    val hostId: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val quizSet: QuizSetSummary? = null,
    val host: HostSummary? = null,
    @SerialName("_count") val count: ExamRoomCount? = null,
)

@Serializable
data class ExamRoomListResponse(
    val examRooms: List<ExamRoom> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
    val totalPages: Int = 1,
)

@Serializable
data class CreateExamRoomRequest(
    val title: String,
    val description: String? = null,
    val quizSetId: String,
)

@Serializable
data class CreateExamRoomResponse(
    val message: String? = null,
    val examRoom: ExamRoom,
)

// Session — aligned with BE shape (startTime/endTime/isActive/accessCode, int assessType).
@Serializable
data class ExamSession(
    val id: String,
    val examRoomId: String,
    val startTime: String? = null,
    val endTime: String? = null,
    val accessCode: String? = null,
    val status: Int = 0, // 0 UPCOMING / 1 ONGOING / 2 ENDED
    val assessType: Int = 0,
    val maxAttempts: Int = 1,
    val questionCount: Int? = null,
    val distinctUserCount: Int = 0,
)

@Serializable
data class ExamRoomSessionsResponse(
    val sessions: List<ExamSession> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 10,
    val totalPages: Int = 1,
    val totalDistinctParticipants: Int = 0,
)

@Serializable
data class LabelQuestionConfig(
    val labelId: String,
    val count: Int,
)

// Create session — defaults mirror BE CreateExamSessionSchema.
// assessType: 0 PUBLIC / 1 PRIVATE.
// questionSelectionMode: 0 ALL / 1 RANDOM_TOTAL / 2 RANDOM_BY_LABEL.
@Serializable
data class CreateExamSessionRequest(
    val examRoomId: String,
    val startTime: String,
    val endTime: String? = null,
    val assessType: Int = 0,
    val allowRetake: Boolean = false,
    val maxAttempts: Int = 1,
    val accessCode: String? = null,
    val whitelist: List<String> = emptyList(),
    val showAnswersAfterSubmit: Boolean = true,
    val passingScore: Int = 40,
    val questionCount: Int? = null,
    val questionSelectionMode: Int = 0,
    val labelQuestionConfig: List<LabelQuestionConfig>? = null,
    val shuffleQuestions: Boolean = false,
    val autoJoinByLink: Boolean = false,
)

@Serializable
data class CreateExamSessionResponse(
    val message: String? = null,
    val examSession: ExamSession,
)

@Serializable
data class AvailableLabel(
    val id: String,
    val name: String,
    val color: String? = null,
    val questionCount: Int = 0,
)

@Serializable
data class AvailableLabelsResponse(
    val totalQuestions: Int = 0,
    val labels: List<AvailableLabel> = emptyList(),
    val unlabeledCount: Int = 0,
)

@Serializable
data class SearchUser(
    val id: String,
    val name: String? = null,
    val email: String? = null,
)
