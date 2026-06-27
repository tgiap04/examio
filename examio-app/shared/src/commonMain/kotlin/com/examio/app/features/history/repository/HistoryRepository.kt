package com.examio.app.features.history.repository

import com.examio.app.features.history.api.HistoryApiService

class HistoryRepository(private val api: HistoryApiService) {
    suspend fun stats() = api.stats()
    suspend fun pdfHistory(limit: Int = 20) = api.pdfHistory(limit)
    suspend fun examHistory(page: Int = 1, limit: Int = 20) = api.examHistory(page, limit)
}
