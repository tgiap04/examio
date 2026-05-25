package com.examio.app.features.ai.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.PaginatedResponse
import com.examio.app.core.network.safeApiCall
import com.examio.app.features.ai.models.GenerateExamRequest
import com.examio.app.features.ai.models.GenerateExamResponse
import com.examio.app.features.ai.models.RecentUpload
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody


class AIGeneratorApiService(private val client: HttpClient) {
    suspend fun recentUploads(limit: Int = 20): ApiResult<List<RecentUpload>> = safeApiCall { client.get("${ApiEndpoints.AI}/recent-uploads") { parameter("limit", limit) } }
    suspend fun generate(request: GenerateExamRequest): ApiResult<GenerateExamResponse> = safeApiCall { client.post("${ApiEndpoints.AI}/generate-from-file") { setBody(request) } }
}
