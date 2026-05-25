package com.examio.app.features.exams.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.PaginatedResponse
import com.examio.app.core.network.safeApiCall
import com.examio.app.core.network.safeUnitApiCall
import com.examio.app.features.exams.models.CreateQuizSetRequest
import com.examio.app.features.exams.models.Question
import com.examio.app.features.exams.models.QuizSet
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody


class QuizSetApiService(private val client: HttpClient) {
    suspend fun list(page: Int = 1, limit: Int = 20, search: String? = null): ApiResult<PaginatedResponse<QuizSet>> =
        safeApiCall { client.get(ApiEndpoints.QUIZ_SETS) { parameter("page", page); parameter("limit", limit); search?.let { parameter("search", it) } } }
    suspend fun get(id: String): ApiResult<QuizSet> = safeApiCall { client.get("${ApiEndpoints.QUIZ_SETS}/$id") }
    suspend fun create(request: CreateQuizSetRequest): ApiResult<QuizSet> = safeApiCall { client.post(ApiEndpoints.QUIZ_SETS) { setBody(request) } }
    suspend fun update(id: String, request: CreateQuizSetRequest): ApiResult<QuizSet> = safeApiCall { client.put("${ApiEndpoints.QUIZ_SETS}/$id") { setBody(request) } }
    suspend fun delete(id: String): ApiResult<Unit> = safeUnitApiCall { client.delete("${ApiEndpoints.QUIZ_SETS}/$id") }
    suspend fun questions(id: String): ApiResult<PaginatedResponse<Question>> = safeApiCall { client.get("${ApiEndpoints.QUIZ_SETS}/$id/questions") }
}
