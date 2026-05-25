package com.examio.app.features.ai.models

import kotlinx.serialization.Serializable

@Serializable
data class AIChat(
    val id: String,
    val title: String,
    val subjectId: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class AIChatMessage(
    val id: String,
    val chatId: String,
    val role: String,
    val content: String,
    val createdAt: String? = null,
)

@Serializable
data class SendMessageRequest(
    val chatId: String? = null,
    val subjectId: String? = null,
    val content: String,
    val documentIds: List<String> = emptyList(),
)
