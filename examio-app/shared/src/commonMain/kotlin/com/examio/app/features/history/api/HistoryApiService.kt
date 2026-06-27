package com.examio.app.features.history.api

import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.safeApiCall
import com.examio.app.features.history.models.ExamHistoryResponse
import com.examio.app.features.history.models.HistoryStats
import com.examio.app.features.history.models.PDFHistoryItem
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.parameter

class HistoryApiService(private val client: HttpClient) {
    suspend fun stats(): ApiResult<HistoryStats> =
        safeApiCall { client.get("/examattempts/history-stats") }

    suspend fun pdfHistory(limit: Int = 20): ApiResult<List<PDFHistoryItem>> =
        safeApiCall { client.get("/ai/recent-uploads") { parameter("limit", limit) } }

    suspend fun examHistory(page: Int = 1, limit: Int = 20): ApiResult<ExamHistoryResponse> =
        safeApiCall { client.get("/examattempts/list") { parameter("page", page); parameter("limit", limit) } }
}
