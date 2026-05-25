package com.examio.app.features.exams.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.PaginatedResponse
import com.examio.app.core.network.safeApiCall
import com.examio.app.features.exams.models.ExamRoom
import com.examio.app.features.exams.models.ExamSession
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter


class ExamRoomApiService(private val client: HttpClient) {
    suspend fun list(page: Int = 1, limit: Int = 20): ApiResult<PaginatedResponse<ExamRoom>> =
        safeApiCall { client.get("${ApiEndpoints.EXAM_ROOMS}/list") { parameter("page", page); parameter("limit", limit) } }
    suspend fun get(id: String): ApiResult<ExamRoom> = safeApiCall { client.get("${ApiEndpoints.EXAM_ROOMS}/detail/$id") }
    suspend fun sessions(roomId: String): ApiResult<PaginatedResponse<ExamSession>> = safeApiCall { client.get("${ApiEndpoints.EXAM_ROOMS}/$roomId/sessions") }
}
