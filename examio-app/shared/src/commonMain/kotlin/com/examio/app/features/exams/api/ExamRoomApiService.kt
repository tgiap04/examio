package com.examio.app.features.exams.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.safeApiCall
import com.examio.app.core.network.safeUnitApiCall
import com.examio.app.features.exams.models.CreateExamRoomRequest
import com.examio.app.features.exams.models.CreateExamRoomResponse
import com.examio.app.features.exams.models.ExamRoom
import com.examio.app.features.exams.models.ExamRoomListResponse
import com.examio.app.features.exams.models.ExamRoomSessionsResponse
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody

class ExamRoomApiService(private val client: HttpClient) {
    suspend fun list(page: Int = 1, limit: Int = 20, search: String? = null): ApiResult<ExamRoomListResponse> =
        safeApiCall {
            client.get("${ApiEndpoints.EXAM_ROOMS}/list") {
                parameter("page", page)
                parameter("limit", limit)
                search?.let { parameter("search", it) }
            }
        }

    suspend fun get(id: String): ApiResult<ExamRoom> =
        safeApiCall { client.get("${ApiEndpoints.EXAM_ROOMS}/detail/$id") }

    suspend fun create(request: CreateExamRoomRequest): ApiResult<CreateExamRoomResponse> =
        safeApiCall { client.post(ApiEndpoints.EXAM_ROOMS) { setBody(request) } }

    suspend fun delete(id: String): ApiResult<Unit> =
        safeUnitApiCall { client.delete("${ApiEndpoints.EXAM_ROOMS}/$id") }

    suspend fun sessions(roomId: String, page: Int = 1, limit: Int = 10): ApiResult<ExamRoomSessionsResponse> =
        safeApiCall {
            client.get("${ApiEndpoints.EXAM_ROOMS}/$roomId/sessions") {
                parameter("page", page)
                parameter("limit", limit)
            }
        }
}
