package com.examio.app.features.ai.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.PaginatedResponse
import com.examio.app.core.network.safeApiCall
import com.examio.app.features.ai.models.AIChat
import com.examio.app.features.ai.models.AIChatMessage
import com.examio.app.features.ai.models.SendMessageRequest
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody


class AIChatApiService(private val client: HttpClient) {
    suspend fun listChats(): ApiResult<List<AIChat>> = safeApiCall { client.get("${ApiEndpoints.AI}/chats") }
    suspend fun messages(chatId: String): ApiResult<PaginatedResponse<AIChatMessage>> = safeApiCall { client.get("${ApiEndpoints.AI}/chats/$chatId/messages") }
    suspend fun sendMessage(request: SendMessageRequest): ApiResult<AIChatMessage> = safeApiCall { client.post("${ApiEndpoints.AI}/chat") { setBody(request) } }
}
