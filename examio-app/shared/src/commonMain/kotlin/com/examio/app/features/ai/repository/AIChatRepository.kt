package com.examio.app.features.ai.repository

import com.examio.app.core.network.SSEClient
import com.examio.app.features.ai.api.AIChatApiService
import com.examio.app.features.ai.api.AIGeneratorApiService
import com.examio.app.features.ai.api.SubjectApiService
import com.examio.app.features.ai.models.GenerateExamRequest
import com.examio.app.features.ai.models.SendMessageRequest

class AIChatRepository(
    private val chatApi: AIChatApiService,
    private val generatorApi: AIGeneratorApiService,
    private val subjectApi: SubjectApiService,
    private val sseClient: SSEClient,
) {
    suspend fun chats() = chatApi.listChats()
    suspend fun messages(chatId: String) = chatApi.messages(chatId)
    suspend fun sendMessage(request: SendMessageRequest) = chatApi.sendMessage(request)
    suspend fun recentUploads(limit: Int = 20) = generatorApi.recentUploads(limit)
    suspend fun generate(request: GenerateExamRequest) = generatorApi.generate(request)
    suspend fun subjects() = subjectApi.subjects()
    suspend fun categories() = subjectApi.categories()
    suspend fun stream(url: String, headers: Map<String, String>, onEvent: suspend (String) -> Unit) =
        sseClient.stream(url, headers, onEvent)
}
