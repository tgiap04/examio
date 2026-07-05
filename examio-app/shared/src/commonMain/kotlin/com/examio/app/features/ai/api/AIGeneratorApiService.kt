package com.examio.app.features.ai.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.MultipartUploadHelper
import com.examio.app.core.network.PlatformFile
import com.examio.app.core.network.safeApiCall
import com.examio.app.features.ai.models.GenerateJobResponse
import com.examio.app.features.ai.models.JobStatus
import io.ktor.client.HttpClient
import io.ktor.client.request.get

class AIGeneratorApiService(
    private val client: HttpClient,
    private val multipartHelper: MultipartUploadHelper,
) {
    // Sends file as multipart; backend returns {jobId} — poll with getJobStatus.
    suspend fun generateFromFile(
        file: PlatformFile,
        typeResult: Int,
        quantity: Int,
    ): ApiResult<GenerateJobResponse> = safeApiCall {
        multipartHelper.upload(
            url = "${ApiEndpoints.AI}/generate-from-file",
            file = file,
            fieldName = "file",
            extraFields = buildMap {
                put("typeResult", typeResult.toString())
                if (typeResult == 1) put("quantityQuizz", quantity.toString())
                else put("quantityFlashcard", quantity.toString())
                put("isNarrowSearch", "false")
            },
        )
    }

    suspend fun getJobStatus(jobId: String): ApiResult<JobStatus> =
        safeApiCall { client.get("${ApiEndpoints.AI}/job/$jobId") }
}
