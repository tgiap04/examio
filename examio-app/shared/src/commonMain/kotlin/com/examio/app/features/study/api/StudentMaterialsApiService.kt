package com.examio.app.features.study.api

import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.safeApiCall
import com.examio.app.features.exams.models.RecentExamsResponse
import com.examio.app.features.study.models.PinResponse
import com.examio.app.features.study.models.RecentFlashcardsResponse
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post

class StudentMaterialsApiService(private val client: HttpClient) {
    suspend fun recentFlashcards(page: Int = 1, limit: Int = 20): ApiResult<RecentFlashcardsResponse> =
        safeApiCall { client.get("/student/recent-flashcards") { parameter("page", page); parameter("limit", limit) } }

    suspend fun recentExams(page: Int = 1, limit: Int = 20): ApiResult<RecentExamsResponse> =
        safeApiCall { client.get("/student/recent-exams") { parameter("page", page); parameter("limit", limit) } }

    suspend fun toggleFlashcardPin(id: String): ApiResult<PinResponse> =
        safeApiCall { client.post("/student/pin-flashcard/$id") }

    suspend fun toggleExamRoomPin(id: String): ApiResult<PinResponse> =
        safeApiCall { client.post("/student/pin-exam-room/$id") }
}
