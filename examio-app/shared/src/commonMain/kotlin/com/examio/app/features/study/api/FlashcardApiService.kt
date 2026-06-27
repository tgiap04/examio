package com.examio.app.features.study.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.safeApiCall
import com.examio.app.core.network.safeUnitApiCall
import com.examio.app.features.study.models.CreateFlashcardRequest
import com.examio.app.features.study.models.CreateFlashcardSetRequest
import com.examio.app.features.study.models.CreateLabelRequest
import com.examio.app.features.study.models.Flashcard
import com.examio.app.features.study.models.FlashcardCardsResponse
import com.examio.app.features.study.models.FlashcardSet
import com.examio.app.features.study.models.FlashcardSetListResponse
import com.examio.app.features.study.models.LabelResponse
import com.examio.app.features.study.models.LabelsResponse
import com.examio.app.features.study.models.UpdateFlashcardRequest
import com.examio.app.features.study.models.UpdateLabelRequest
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody

class FlashcardApiService(private val client: HttpClient) {
    // Set CRUD
    suspend fun list(page: Int = 1, limit: Int = 20, search: String? = null): ApiResult<FlashcardSetListResponse> =
        safeApiCall { client.get(ApiEndpoints.FLASHCARD_SETS) { parameter("page", page); parameter("limit", limit); search?.let { parameter("search", it) } } }

    suspend fun get(id: String): ApiResult<FlashcardSet> =
        safeApiCall { client.get("${ApiEndpoints.FLASHCARD_SETS}/$id") }

    suspend fun create(request: CreateFlashcardSetRequest): ApiResult<FlashcardSet> =
        safeApiCall { client.post(ApiEndpoints.FLASHCARD_SETS) { setBody(request) } }

    suspend fun update(id: String, request: CreateFlashcardSetRequest): ApiResult<FlashcardSet> =
        safeApiCall { client.put("${ApiEndpoints.FLASHCARD_SETS}/$id") { setBody(request) } }

    suspend fun delete(id: String): ApiResult<Unit> =
        safeUnitApiCall { client.delete("${ApiEndpoints.FLASHCARD_SETS}/$id") }

    // Flashcard CRUD
    suspend fun flashcards(setId: String, page: Int = 1, limit: Int = 100): ApiResult<FlashcardCardsResponse> =
        safeApiCall { client.get("${ApiEndpoints.FLASHCARD_SETS}/$setId/flashcards") { parameter("page", page); parameter("limit", limit) } }

    suspend fun addFlashcard(setId: String, request: CreateFlashcardRequest): ApiResult<Flashcard> =
        safeApiCall { client.post("${ApiEndpoints.FLASHCARD_SETS}/$setId/flashcards") { setBody(request) } }

    suspend fun updateFlashcard(setId: String, cardId: String, request: UpdateFlashcardRequest): ApiResult<Flashcard> =
        safeApiCall { client.put("${ApiEndpoints.FLASHCARD_SETS}/$setId/flashcards/$cardId") { setBody(request) } }

    suspend fun deleteFlashcard(setId: String, cardId: String): ApiResult<Unit> =
        safeUnitApiCall { client.delete("${ApiEndpoints.FLASHCARD_SETS}/$setId/flashcards/$cardId") }

    // Labels
    suspend fun getLabels(setId: String): ApiResult<LabelsResponse> =
        safeApiCall { client.get("${ApiEndpoints.FLASHCARD_SETS}/$setId/labels") }

    suspend fun createLabel(setId: String, request: CreateLabelRequest): ApiResult<LabelResponse> =
        safeApiCall { client.post("${ApiEndpoints.FLASHCARD_SETS}/$setId/labels") { setBody(request) } }

    suspend fun updateLabel(setId: String, labelId: String, request: UpdateLabelRequest): ApiResult<LabelResponse> =
        safeApiCall { client.put("${ApiEndpoints.FLASHCARD_SETS}/$setId/labels/$labelId") { setBody(request) } }

    suspend fun deleteLabel(setId: String, labelId: String): ApiResult<Unit> =
        safeUnitApiCall { client.delete("${ApiEndpoints.FLASHCARD_SETS}/$setId/labels/$labelId") }
}
