package com.examio.app.features.ai.repository

import com.examio.app.core.network.PlatformFile
import com.examio.app.features.ai.api.AIGeneratorApiService
import com.examio.app.features.ai.models.JobStatus
import com.examio.app.features.ai.util.AiJobPoller
import kotlinx.coroutines.flow.Flow

// AI flashcard/quiz generation from an uploaded document.
// Upload → {jobId} → poll GET /ai/job/{jobId} until terminal → result carries historyId.
class AIGeneratorRepository(
    private val generatorApi: AIGeneratorApiService,
) {
    private val jobPoller = AiJobPoller { jobId -> generatorApi.getJobStatus(jobId) }

    suspend fun generateFromFile(
        file: PlatformFile,
        typeResult: Int,
        quantity: Int,
    ) = generatorApi.generateFromFile(file, typeResult, quantity)

    fun pollJob(jobId: String): Flow<JobStatus> = jobPoller.poll(jobId)
}
