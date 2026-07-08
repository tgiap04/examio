package com.examio.app.features.exams.repository

import com.examio.app.core.crypto.QuizDecryptor
import com.examio.app.core.network.ApiResult
import com.examio.app.features.exams.api.ExamAttemptApiService
import com.examio.app.features.exams.api.ExamRoomApiService
import com.examio.app.features.exams.api.ExamSessionApiService
import com.examio.app.features.exams.api.QuizSetApiService
import com.examio.app.features.exams.models.CreateExamRoomRequest
import com.examio.app.features.exams.models.CreateExamSessionRequest
import com.examio.app.features.exams.models.CreateQuestionRequest
import com.examio.app.features.exams.models.CreateQuizSetRequest
import com.examio.app.features.exams.models.DecryptedQuestion
import com.examio.app.features.exams.models.ExamAttempt
import com.examio.app.features.exams.models.UpdateQuestionRequest
import com.examio.app.features.exams.models.SecureQuestion
import com.examio.app.features.exams.models.SecureQuizResponse
import com.examio.app.features.exams.models.StartExamAttemptRequest
import com.examio.app.features.exams.models.SubmitExamAttemptRequest
import com.examio.app.features.exams.models.UpdateProgressRequest
import com.examio.app.features.exams.models.SaveHistoryToQuizsetRequest
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

class ExamRepository(
    private val quizSets: QuizSetApiService,
    private val rooms: ExamRoomApiService,
    private val sessions: ExamSessionApiService,
    private val attempts: ExamAttemptApiService,
    private val decryptor: QuizDecryptor? = null,
) {
    suspend fun quizSets(page: Int = 1, limit: Int = 20, search: String? = null) = quizSets.list(page, limit, search)
    suspend fun createQuizSet(request: CreateQuizSetRequest) = quizSets.create(request)
    suspend fun updateQuizSet(id: String, request: CreateQuizSetRequest) = quizSets.update(id, request)
    suspend fun deleteQuizSet(id: String) = quizSets.delete(id)
    suspend fun quizSetQuestions(id: String, page: Int = 1, limit: Int = 100) = quizSets.questions(id, page, limit)
    suspend fun addQuestion(id: String, request: CreateQuestionRequest) = quizSets.addQuestion(id, request)
    suspend fun updateQuestion(id: String, questionId: String, request: UpdateQuestionRequest) = quizSets.updateQuestion(id, questionId, request)
    suspend fun deleteQuestion(id: String, questionId: String) = quizSets.deleteQuestion(id, questionId)
    suspend fun saveHistoryToQuizset(request: SaveHistoryToQuizsetRequest) = quizSets.saveHistoryToQuizset(request)
    suspend fun examRooms(page: Int = 1, limit: Int = 20, search: String? = null) = rooms.list(page, limit, search)
    suspend fun examRoom(id: String) = rooms.get(id)
    suspend fun createExamRoom(request: CreateExamRoomRequest) = rooms.create(request)
    suspend fun deleteExamRoom(id: String) = rooms.delete(id)
    suspend fun examRoomSessions(roomId: String, page: Int = 1, limit: Int = 10) = rooms.sessions(roomId, page, limit)
    suspend fun createExamSession(request: CreateExamSessionRequest) = sessions.create(request)
    suspend fun deleteExamSession(id: String) = sessions.delete(id)
    suspend fun availableLabels(roomId: String) = sessions.availableLabels(roomId)
    suspend fun searchUsers(query: String) = sessions.searchUsers(query)
    suspend fun attempts(page: Int = 1, limit: Int = 20) = attempts.list(page, limit)
    /** Start/resume an attempt; unwraps the BE { examAttempt } envelope to the attempt itself. */
    suspend fun startAttempt(sessionId: String): ApiResult<ExamAttempt> =
        when (val res = attempts.start(StartExamAttemptRequest(sessionId))) {
            is ApiResult.Success -> ApiResult.Success(res.data.examAttempt)
            is ApiResult.HttpError -> res
            is ApiResult.NetworkError -> res
        }
    suspend fun secureQuiz(attemptId: String) = attempts.secureQuiz(attemptId)
    suspend fun submit(attemptId: String, request: SubmitExamAttemptRequest) = attempts.submit(attemptId, request)
    suspend fun updateProgress(attemptId: String, request: UpdateProgressRequest) = attempts.updateProgress(attemptId, request)

    /** Fetch the secure quiz and decrypt each question client-side. */
    suspend fun decryptedQuiz(attemptId: String): ApiResult<DecryptedQuiz> {
        return when (val res = attempts.secureQuiz(attemptId)) {
            is ApiResult.Success -> ApiResult.Success(
                DecryptedQuiz(res.data, res.data.questions.map(::decryptQuestion)),
            )
            is ApiResult.HttpError -> res
            is ApiResult.NetworkError -> res
        }
    }

    private fun decryptQuestion(q: SecureQuestion): DecryptedQuestion {
        val d = decryptor
        val question = d?.decrypt(q.question_encrypted) ?: ERROR_TEXT
        val options = d?.let { parseOptions(it.decrypt(q.options_encrypted)) } ?: listOf(ERROR_TEXT)
        return DecryptedQuestion(index = q.index, token = q.token, question = question, options = options)
    }

    private fun parseOptions(decrypted: String): List<String> {
        if (decrypted == ERROR_TEXT) return listOf(ERROR_TEXT)
        return try {
            Json.decodeFromString(ListSerializer(String.serializer()), decrypted)
        } catch (e: Exception) {
            listOf(ERROR_TEXT)
        }
    }

    private companion object {
        const val ERROR_TEXT = "[Lỗi giải mã]"
    }
}

/** Secure quiz response paired with its decrypted questions. */
data class DecryptedQuiz(
    val raw: SecureQuizResponse,
    val questions: List<DecryptedQuestion>,
)
