package com.examio.app.features.exams.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.PaginatedResponse
import com.examio.app.core.network.safeApiCall
import com.examio.app.features.exams.models.ExamAttempt
import com.examio.app.features.exams.models.SecureQuizResponse
import com.examio.app.features.exams.models.StartExamAttemptRequest
import com.examio.app.features.exams.models.SubmitExamAttemptRequest
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody


class ExamAttemptApiService(private val client: HttpClient) {
    suspend fun start(request: StartExamAttemptRequest): ApiResult<ExamAttempt> = safeApiCall { client.post("${ApiEndpoints.EXAM_ATTEMPTS}/start") { setBody(request) } }
    suspend fun list(page: Int = 1, limit: Int = 20): ApiResult<PaginatedResponse<ExamAttempt>> = safeApiCall { client.get("${ApiEndpoints.EXAM_ATTEMPTS}/list") { parameter("page", page); parameter("limit", limit) } }
    suspend fun secureQuiz(attemptId: String): ApiResult<SecureQuizResponse> = safeApiCall { client.get("${ApiEndpoints.EXAM_ATTEMPTS}/$attemptId/secure-quiz") }
    suspend fun submit(attemptId: String, request: SubmitExamAttemptRequest): ApiResult<ExamAttempt> = safeApiCall { client.post("${ApiEndpoints.EXAM_ATTEMPTS}/$attemptId/secure-submit") { setBody(request) } }
}
