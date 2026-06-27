package com.examio.app.features.ai.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.MultipartUploadHelper
import com.examio.app.core.network.PlatformFile
import com.examio.app.core.network.safeApiCall
import com.examio.app.core.network.safeUnitApiCall
import com.examio.app.features.ai.models.GenerateJobResponse
import com.examio.app.features.ai.models.JobStatus
import com.examio.app.features.ai.models.RecentUpload
import com.examio.app.features.ai.models.RegenerateRequest
import com.examio.app.features.ai.models.UploadDetail
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody

class AIGeneratorApiService(
    private val client: HttpClient,
    private val multipartHelper: MultipartUploadHelper,
) {
    suspend fun recentUploads(limit: Int = 20): ApiResult<List<RecentUpload>> =
        safeApiCall { client.get("${ApiEndpoints.AI}/recent-uploads") { parameter("limit", limit) } }

    suspend fun uploadDetail(uploadId: String): ApiResult<UploadDetail> =
        safeApiCall { client.get("${ApiEndpoints.AI}/upload/$uploadId") }

    suspend fun deleteUpload(uploadId: String): ApiResult<Unit> =
        safeUnitApiCall { client.delete("${ApiEndpoints.AI}/upload/$uploadId") }

    // Sends file as multipart; backend returns {jobId} — poll with getJobStatus.
    suspend fun generateFromFile(
        file: PlatformFile,
        typeResult: Int,
        quantity: Int,
        isNarrowSearch: Boolean = false,
        keyword: String? = null,
    ): ApiResult<GenerateJobResponse> = safeApiCall {
        multipartHelper.upload(
            url = "${ApiEndpoints.AI}/generate-from-file",
            file = file,
            fieldName = "file",
            extraFields = buildMap {
                put("typeResult", typeResult.toString())
                if (typeResult == 1) put("quantityQuizz", quantity.toString())
                else put("quantityFlashcard", quantity.toString())
                put("isNarrowSearch", isNarrowSearch.toString())
                if (keyword != null) put("keyword", keyword)
            },
        )
    }

    suspend fun regenerateFromUpload(
        uploadId: String,
        typeResult: Int,
        quantity: Int,
        isNarrowSearch: Boolean = false,
        keyword: String? = null,
    ): ApiResult<GenerateJobResponse> = safeApiCall {
        client.post("${ApiEndpoints.AI}/regenerate/$uploadId") {
            setBody(
                RegenerateRequest(
                    typeResult = typeResult,
                    quantityQuizz = if (typeResult == 1) quantity else null,
                    quantityFlashcard = if (typeResult == 2) quantity else null,
                    isNarrowSearch = isNarrowSearch,
                    keyword = keyword,
                ),
            )
        }
    }

    suspend fun getJobStatus(jobId: String): ApiResult<JobStatus> =
        safeApiCall { client.get("${ApiEndpoints.AI}/job/$jobId") }

    suspend fun cancelJob(jobId: String): ApiResult<Unit> =
        safeUnitApiCall { client.delete("${ApiEndpoints.AI}/job/$jobId") }
}
