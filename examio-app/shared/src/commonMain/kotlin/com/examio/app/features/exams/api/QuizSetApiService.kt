package com.examio.app.features.exams.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.safeApiCall
import com.examio.app.core.network.safeUnitApiCall
import com.examio.app.features.exams.models.CreateQuestionRequest
import com.examio.app.features.exams.models.CreateQuizSetRequest
import com.examio.app.features.exams.models.Question
import com.examio.app.features.exams.models.QuizSet
import com.examio.app.features.exams.models.QuizSetCreateResponse
import com.examio.app.features.exams.models.QuizSetLabelsResponse
import com.examio.app.features.exams.models.QuizSetListResponse
import com.examio.app.features.exams.models.QuizSetQuestionsResponse
import com.examio.app.features.exams.models.SaveHistoryResult
import com.examio.app.features.exams.models.SaveHistoryToQuizsetRequest
import com.examio.app.features.exams.models.UpdateQuestionRequest
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody

class QuizSetApiService(private val client: HttpClient) {
    // Set CRUD
    suspend fun list(page: Int = 1, limit: Int = 20, search: String? = null): ApiResult<QuizSetListResponse> =
        safeApiCall { client.get(ApiEndpoints.QUIZ_SETS) { parameter("page", page); parameter("limit", limit); search?.let { parameter("search", it) } } }

    suspend fun get(id: String): ApiResult<QuizSet> =
        safeApiCall { client.get("${ApiEndpoints.QUIZ_SETS}/$id") }

    suspend fun create(request: CreateQuizSetRequest): ApiResult<QuizSetCreateResponse> =
        safeApiCall { client.post(ApiEndpoints.QUIZ_SETS) { setBody(request) } }

    suspend fun update(id: String, request: CreateQuizSetRequest): ApiResult<QuizSetCreateResponse> =
        safeApiCall { client.put("${ApiEndpoints.QUIZ_SETS}/$id") { setBody(request) } }

    suspend fun delete(id: String): ApiResult<Unit> =
        safeUnitApiCall { client.delete("${ApiEndpoints.QUIZ_SETS}/$id") }

    // Questions
    suspend fun questions(id: String, page: Int = 1, limit: Int = 100): ApiResult<QuizSetQuestionsResponse> =
        safeApiCall { client.get("${ApiEndpoints.QUIZ_SETS}/$id/questions") { parameter("page", page); parameter("limit", limit) } }

    suspend fun addQuestion(id: String, request: CreateQuestionRequest): ApiResult<Question> =
        safeApiCall { client.post("${ApiEndpoints.QUIZ_SETS}/$id/questions") { setBody(request) } }

    suspend fun updateQuestion(id: String, questionId: String, request: UpdateQuestionRequest): ApiResult<Question> =
        safeApiCall { client.put("${ApiEndpoints.QUIZ_SETS}/$id/questions/$questionId") { setBody(request) } }

    suspend fun deleteQuestion(id: String, questionId: String): ApiResult<Unit> =
        safeUnitApiCall { client.delete("${ApiEndpoints.QUIZ_SETS}/$id/questions/$questionId") }

    // Labels
    suspend fun getLabels(id: String): ApiResult<QuizSetLabelsResponse> =
        safeApiCall { client.get("${ApiEndpoints.QUIZ_SETS}/$id/labels") }

    // Persist a generated quiz history into one or more sets.
    suspend fun saveHistoryToQuizset(request: SaveHistoryToQuizsetRequest): ApiResult<SaveHistoryResult> =
        safeApiCall { client.post("${ApiEndpoints.QUIZ_SETS}/save-history-to-quizset") { setBody(request) } }
}
