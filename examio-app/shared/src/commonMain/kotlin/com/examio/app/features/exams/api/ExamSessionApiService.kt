package com.examio.app.features.exams.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.safeApiCall
import com.examio.app.core.network.safeUnitApiCall
import com.examio.app.features.exams.models.AvailableLabelsResponse
import com.examio.app.features.exams.models.CreateExamSessionRequest
import com.examio.app.features.exams.models.CreateExamSessionResponse
import com.examio.app.features.exams.models.SearchUser
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody

class ExamSessionApiService(private val client: HttpClient) {
    suspend fun create(request: CreateExamSessionRequest): ApiResult<CreateExamSessionResponse> =
        safeApiCall { client.post(ApiEndpoints.EXAM_SESSIONS) { setBody(request) } }

    suspend fun delete(id: String): ApiResult<Unit> =
        safeUnitApiCall { client.delete("${ApiEndpoints.EXAM_SESSIONS}/$id") }

    suspend fun availableLabels(roomId: String): ApiResult<AvailableLabelsResponse> =
        safeApiCall { client.get("${ApiEndpoints.EXAM_SESSIONS}/room/$roomId/available-labels") }

    suspend fun searchUsers(query: String): ApiResult<List<SearchUser>> =
        safeApiCall {
            client.get("${ApiEndpoints.EXAM_SESSIONS}/users/search") { parameter("q", query) }
        }
}
