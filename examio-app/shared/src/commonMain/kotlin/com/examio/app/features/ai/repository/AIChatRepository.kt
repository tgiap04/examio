package com.examio.app.features.ai.repository

import com.examio.app.core.network.PlatformFile
import com.examio.app.core.network.SSEClient
import com.examio.app.features.ai.api.AIChatApiService
import com.examio.app.features.ai.api.AIGeneratorApiService
import com.examio.app.features.ai.api.SubjectApiService
import com.examio.app.features.ai.models.SendMessageRequest
import com.examio.app.features.ai.util.AiJobPoller
import kotlinx.coroutines.flow.Flow
import com.examio.app.features.ai.models.JobStatus

class AIChatRepository(
    private val chatApi: AIChatApiService,
    private val generatorApi: AIGeneratorApiService,
    private val subjectApi: SubjectApiService,
    private val sseClient: SSEClient,
) {
    private val jobPoller = AiJobPoller { jobId -> generatorApi.getJobStatus(jobId) }

    suspend fun chats() = chatApi.listChats()
    suspend fun messages(chatId: String) = chatApi.messages(chatId)
    suspend fun sendMessage(request: SendMessageRequest) = chatApi.sendMessage(request)
    suspend fun subjects() = subjectApi.subjects()
    suspend fun categories() = subjectApi.categories()
    suspend fun stream(url: String, headers: Map<String, String>, onEvent: suspend (String) -> Unit) =
        sseClient.stream(url, headers, onEvent)

    // AI generator
    suspend fun recentUploads(limit: Int = 20) = generatorApi.recentUploads(limit)
    suspend fun uploadDetail(uploadId: String) = generatorApi.uploadDetail(uploadId)
    suspend fun deleteUpload(uploadId: String) = generatorApi.deleteUpload(uploadId)
    suspend fun generateFromFile(
        file: PlatformFile,
        typeResult: Int,
        quantity: Int,
        isNarrowSearch: Boolean = false,
        keyword: String? = null,
    ) = generatorApi.generateFromFile(file, typeResult, quantity, isNarrowSearch, keyword)
    suspend fun regenerateFromUpload(
        uploadId: String,
        typeResult: Int,
        quantity: Int,
        isNarrowSearch: Boolean = false,
        keyword: String? = null,
    ) = generatorApi.regenerateFromUpload(uploadId, typeResult, quantity, isNarrowSearch, keyword)
    suspend fun cancelJob(jobId: String) = generatorApi.cancelJob(jobId)
    fun pollJob(jobId: String): Flow<JobStatus> = jobPoller.poll(jobId)
}
