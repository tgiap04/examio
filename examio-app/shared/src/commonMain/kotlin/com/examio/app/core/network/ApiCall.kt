package com.examio.app.core.network

import io.ktor.client.call.body
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.plugins.ServerResponseException
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.utils.io.errors.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@PublishedApi
internal val lenientJson = Json { ignoreUnknownKeys = true; isLenient = true }

@PublishedApi
internal suspend fun extractApiMessage(error: ClientRequestException, fallback: String): String =
    try {
        val text = error.response.bodyAsText()
        lenientJson.parseToJsonElement(text).jsonObject["message"]?.jsonPrimitive?.content
            ?: fallback
    } catch (_: Throwable) {
        fallback
    }

@PublishedApi
internal fun httpFallbackMessage(status: Int): String = when (status) {
    400 -> "Yêu cầu không hợp lệ."
    401 -> "Sai tài khoản hoặc mật khẩu."
    403 -> "Bạn không có quyền thực hiện thao tác này."
    404 -> "Không tìm thấy tài nguyên."
    409 -> "Dữ liệu đã tồn tại."
    422 -> "Dữ liệu không hợp lệ."
    429 -> "Quá nhiều yêu cầu. Vui lòng thử lại sau."
    500, 502, 503 -> "Lỗi máy chủ. Vui lòng thử lại sau."
    else -> "Đã xảy ra lỗi ($status)."
}

suspend inline fun <reified T> safeApiCall(crossinline block: suspend () -> HttpResponse): ApiResult<T> =
    try {
        ApiResult.Success(block().body())
    } catch (error: ClientRequestException) {
        val status = error.response.status.value
        val msg = extractApiMessage(error, httpFallbackMessage(status))
        ApiResult.HttpError(status, msg)
    } catch (error: ServerResponseException) {
        ApiResult.HttpError(error.response.status.value, httpFallbackMessage(error.response.status.value))
    } catch (error: IOException) {
        ApiResult.NetworkError("Không thể kết nối. Vui lòng kiểm tra mạng.")
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        ApiResult.NetworkError("Đã xảy ra lỗi không xác định.")
    }

suspend inline fun safeUnitApiCall(crossinline block: suspend () -> HttpResponse): ApiResult<Unit> =
    try {
        block()
        ApiResult.Success(Unit)
    } catch (error: ClientRequestException) {
        val status = error.response.status.value
        val msg = extractApiMessage(error, httpFallbackMessage(status))
        ApiResult.HttpError(status, msg)
    } catch (error: ServerResponseException) {
        ApiResult.HttpError(error.response.status.value, httpFallbackMessage(error.response.status.value))
    } catch (error: IOException) {
        ApiResult.NetworkError("Không thể kết nối. Vui lòng kiểm tra mạng.")
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        ApiResult.NetworkError("Đã xảy ra lỗi không xác định.")
    }
