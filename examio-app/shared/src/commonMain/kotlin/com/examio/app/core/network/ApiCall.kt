package com.examio.app.core.network

import io.ktor.client.call.body
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.plugins.ServerResponseException
import io.ktor.client.statement.HttpResponse
import io.ktor.utils.io.errors.IOException
import kotlinx.coroutines.CancellationException

suspend inline fun <reified T> safeApiCall(crossinline block: suspend () -> HttpResponse): ApiResult<T> =
    try {
        ApiResult.Success(block().body())
    } catch (error: ClientRequestException) {
        ApiResult.HttpError(error.response.status.value, error.message)
    } catch (error: ServerResponseException) {
        ApiResult.HttpError(error.response.status.value, error.message)
    } catch (error: IOException) {
        ApiResult.NetworkError(error.message ?: "Network error")
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        ApiResult.NetworkError(error.message ?: "Unknown error")
    }

suspend inline fun safeUnitApiCall(crossinline block: suspend () -> HttpResponse): ApiResult<Unit> =
    try {
        block()
        ApiResult.Success(Unit)
    } catch (error: ClientRequestException) {
        ApiResult.HttpError(error.response.status.value, error.message)
    } catch (error: ServerResponseException) {
        ApiResult.HttpError(error.response.status.value, error.message)
    } catch (error: IOException) {
        ApiResult.NetworkError(error.message ?: "Network error")
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        ApiResult.NetworkError(error.message ?: "Unknown error")
    }
