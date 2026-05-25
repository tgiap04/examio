package com.examio.app.features.ai.models

import kotlinx.serialization.Serializable

@Serializable
data class RecentUpload(
    val id: String,
    val filename: String,
    val processingStatus: String,
    val createdAt: String? = null,
)

@Serializable
data class GenerateExamRequest(
    val uploadId: String,
    val questionCount: Int,
    val difficulty: String? = null,
)

@Serializable
data class GenerateExamResponse(
    val jobId: String? = null,
    val uploadId: String? = null,
    val status: String,
)
