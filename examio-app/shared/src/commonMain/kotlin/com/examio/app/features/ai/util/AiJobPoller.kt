package com.examio.app.features.ai.util

import com.examio.app.core.network.ApiResult
import com.examio.app.features.ai.models.JobStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

private const val INITIAL_DELAY_MS = 2_000L
private const val MAX_DELAY_MS = 10_000L
private const val BACKOFF_FACTOR = 1.5
private const val TIMEOUT_MS = 3 * 60_000L  // 3 minutes

// Polls GET /ai/job/{jobId} with exponential backoff until terminal state or timeout.
// The returned Flow is cold and cooperative — cancel the collector to stop polling.
class AiJobPoller(
    private val getJobStatus: suspend (jobId: String) -> ApiResult<JobStatus>,
) {
    fun poll(jobId: String): Flow<JobStatus> = flow {
        var elapsed = 0L
        var intervalMs = INITIAL_DELAY_MS

        while (elapsed < TIMEOUT_MS) {
            when (val result = getJobStatus(jobId)) {
                is ApiResult.Success -> {
                    val status = result.data
                    emit(status)
                    if (status.isTerminal()) return@flow
                }
                is ApiResult.HttpError -> {
                    emit(JobStatus(jobId = jobId, status = "FAILED", error = result.message))
                    return@flow
                }
                is ApiResult.NetworkError -> {
                    // transient — keep polling
                }
            }

            delay(intervalMs)
            elapsed += intervalMs
            intervalMs = (intervalMs * BACKOFF_FACTOR).toLong().coerceAtMost(MAX_DELAY_MS)
        }

        // Timed out — emit a synthetic FAILED
        emit(JobStatus(jobId = jobId, status = "FAILED", error = "Polling timed out"))
    }
}

private fun JobStatus.isTerminal(): Boolean = status in setOf("DONE", "FAILED", "CANCELLED")
