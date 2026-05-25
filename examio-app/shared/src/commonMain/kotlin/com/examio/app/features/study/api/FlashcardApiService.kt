package com.examio.app.features.study.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.PaginatedResponse
import com.examio.app.core.network.safeApiCall
import com.examio.app.core.network.safeUnitApiCall
import com.examio.app.features.study.models.CreateFlashcardSetRequest
import com.examio.app.features.study.models.Flashcard
import com.examio.app.features.study.models.FlashcardSet
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody

class FlashcardApiService(private val client: HttpClient) {
    suspend fun list(page: Int = 1, limit: Int = 20, search: String? = null): ApiResult<PaginatedResponse<FlashcardSet>> =
        safeApiCall { client.get(ApiEndpoints.FLASHCARD_SETS) { parameter("page", page); parameter("limit", limit); search?.let { parameter("search", it) } } }

    suspend fun get(id: String): ApiResult<FlashcardSet> = safeApiCall { client.get("${ApiEndpoints.FLASHCARD_SETS}/$id") }

    suspend fun create(request: CreateFlashcardSetRequest): ApiResult<FlashcardSet> =
        safeApiCall { client.post(ApiEndpoints.FLASHCARD_SETS) { setBody(request) } }

    suspend fun update(id: String, request: CreateFlashcardSetRequest): ApiResult<FlashcardSet> =
        safeApiCall { client.put("${ApiEndpoints.FLASHCARD_SETS}/$id") { setBody(request) } }

    suspend fun delete(id: String): ApiResult<Unit> = safeUnitApiCall { client.delete("${ApiEndpoints.FLASHCARD_SETS}/$id") }

    suspend fun flashcards(setId: String): ApiResult<PaginatedResponse<Flashcard>> =
        safeApiCall { client.get("${ApiEndpoints.FLASHCARD_SETS}/$setId/flashcards") }
}
