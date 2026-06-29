package com.examio.app.core.network

import com.examio.app.core.config.AppConfig
import com.examio.app.core.session.SessionTokens
import com.examio.app.core.storage.SecureTokenStorage
import com.examio.app.features.auth.models.AuthResponse
import com.examio.app.features.auth.models.RefreshTokenRequest
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.plugins.HttpSend
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.plugin
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.request.url
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import io.ktor.utils.io.errors.IOException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json

/**
 * Attaches the access token to every request and, on a 401, performs a
 * single-flight refresh + one retry (mirrors the examio-fe Axios interceptor).
 *
 * The main client runs with `expectSuccess = true`, so a 401 surfaces as a
 * [ClientRequestException] thrown by the inner HttpCallValidator before this
 * interceptor can read the status — hence the refresh is driven from a catch
 * block, not a status check. The retry `execute()` runs through the inner
 * senders only and never re-enters this interceptor, so it is bounded to one
 * attempt. The refresh itself uses a separate bare client (no auth), so it can
 * never recurse here. Concurrent 401s share one refresh via [refreshMutex]:
 * late waiters re-read the freshly-stored token instead of refreshing again.
 */
class AuthInterceptor(
    private val tokenStorage: SecureTokenStorage,
    private val config: AppConfig,
) {
    private val refreshMutex = Mutex()

    private val refreshClient: HttpClient by lazy {
        HttpClient {
            expectSuccess = false
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true; isLenient = true })
            }
        }
    }

    fun installOn(client: HttpClient) {
        client.plugin(HttpSend).intercept { request ->
            val tokens = tokenStorage.readTokens()
            tokens?.let {
                request.bearerAuth(it.accessToken)
                it.deviceId?.let { id -> request.header("X-Device-ID", id) }
            }
            val isRefreshCall = request.url.buildString().endsWith(ApiEndpoints.REFRESH)

            try {
                execute(request)
            } catch (error: ClientRequestException) {
                if (error.response.status != HttpStatusCode.Unauthorized || tokens == null || isRefreshCall) {
                    throw error
                }
                // 401 with a session present: single-flight refresh, then retry once.
                val newAccessToken = refreshAccessToken(tokens.accessToken) ?: throw error
                request.headers.remove("Authorization")
                request.bearerAuth(newAccessToken)
                execute(request)
            }
        }
    }

    /**
     * Returns a usable access token, refreshing if needed. Null means refresh did
     * not yield a token; tokens are cleared only on a genuine auth failure
     * (non-2xx refresh), NOT on a network error — a connectivity blip must not
     * destroy a valid session.
     */
    private suspend fun refreshAccessToken(usedAccessToken: String): String? = refreshMutex.withLock {
        // A concurrent 401 may have already refreshed while we waited for the lock.
        val current = tokenStorage.readTokens()
        if (current != null && current.accessToken != usedAccessToken) {
            return current.accessToken
        }

        val refreshToken = current?.refreshToken
        val response: HttpResponse = try {
            refreshClient.post {
                url("${config.apiBaseUrl}${ApiEndpoints.REFRESH}")
                contentType(ContentType.Application.Json)
                setBody(RefreshTokenRequest(refreshToken))
            }
        } catch (_: IOException) {
            return null // network error — keep tokens, surface the original 401
        }

        if (response.status.value !in 200..299) {
            tokenStorage.clearTokens()
            return null
        }

        val refreshed = runCatching { response.body<AuthResponse>() }.getOrNull()
        val newAccess = refreshed?.let { it.accessToken ?: it.token }
        if (newAccess == null) {
            tokenStorage.clearTokens()
            return null
        }

        tokenStorage.saveTokens(
            SessionTokens(
                accessToken = newAccess,
                refreshToken = refreshed.refreshToken ?: refreshToken,
                sessionId = refreshed.sessionId ?: current?.sessionId,
                deviceId = refreshed.deviceId ?: current?.deviceId,
            ),
        )
        newAccess
    }
}
