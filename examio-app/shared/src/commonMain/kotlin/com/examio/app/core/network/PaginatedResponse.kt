package com.examio.app.core.network

import kotlinx.serialization.Serializable

@Serializable
data class PaginatedResponse<T>(
    val data: List<T>,
    val total: Int = data.size,
    val page: Int = 1,
    val limit: Int = data.size,
    val totalPages: Int = 1,
)
