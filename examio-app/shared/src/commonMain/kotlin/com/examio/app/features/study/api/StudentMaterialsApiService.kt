package com.examio.app.features.study.api

import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.PaginatedResponse
import com.examio.app.core.network.safeApiCall
import com.examio.app.features.exams.models.ExamAttempt
import com.examio.app.features.study.models.FlashcardSet
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post

class StudentMaterialsApiService(private val client: HttpClient) {
    suspend fun recentFlashcards(page: Int = 1, limit: Int = 20): ApiResult<PaginatedResponse<FlashcardSet>> =
        safeApiCall { client.get("/student/materials/flashcards") { parameter("page", page); parameter("limit", limit) } }

    suspend fun recentExams(page: Int = 1, limit: Int = 20): ApiResult<PaginatedResponse<ExamAttempt>> =
        safeApiCall { client.get("/student/materials/exams") { parameter("page", page); parameter("limit", limit) } }

    suspend fun toggleFlashcardPin(id: String): ApiResult<FlashcardSet> =
        safeApiCall { client.post("/student/materials/flashcards/$id/pin") }

    suspend fun toggleExamPin(id: String): ApiResult<ExamAttempt> =
        safeApiCall { client.post("/student/materials/exams/$id/pin") }
}
