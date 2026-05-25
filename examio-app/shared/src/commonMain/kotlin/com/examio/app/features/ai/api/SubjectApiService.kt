package com.examio.app.features.ai.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.safeApiCall
import com.examio.app.features.ai.models.Subject
import com.examio.app.features.ai.models.SubjectCategory
import io.ktor.client.HttpClient
import io.ktor.client.request.get

class SubjectApiService(private val client: HttpClient) {
    suspend fun categories(): ApiResult<List<SubjectCategory>> = safeApiCall { client.get("${ApiEndpoints.SUBJECTS}/categories") }
    suspend fun subjects(): ApiResult<List<Subject>> = safeApiCall { client.get(ApiEndpoints.SUBJECTS) }
    suspend fun subject(id: String): ApiResult<Subject> = safeApiCall { client.get("${ApiEndpoints.SUBJECTS}/$id") }
}
