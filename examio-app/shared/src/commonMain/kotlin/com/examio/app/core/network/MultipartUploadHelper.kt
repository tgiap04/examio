package com.examio.app.core.network

import io.ktor.client.HttpClient
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders

// Shared multipart POST helper — keeps Ktor form-data construction out of each ApiService.
class MultipartUploadHelper(private val client: HttpClient) {

    suspend fun upload(
        url: String,
        file: PlatformFile,
        fieldName: String = "file",
        extraFields: Map<String, String> = emptyMap(),
    ): HttpResponse {
        val bytes = file.readBytes()
        return client.post(url) {
            setBody(
                MultiPartFormDataContent(
                    formData {
                        extraFields.forEach { (key, value) -> append(key, value) }
                        append(
                            fieldName,
                            bytes,
                            Headers.build {
                                append(HttpHeaders.ContentType, file.mimeType)
                                append(
                                    HttpHeaders.ContentDisposition,
                                    "filename=\"${file.filename}\"",
                                )
                            },
                        )
                    },
                ),
            )
        }
    }
}
