package com.examio.app.core.network

import com.examio.app.core.storage.SecureTokenStorage
import io.ktor.client.plugins.HttpSend
import io.ktor.client.plugins.plugin
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.header

class AuthInterceptor(
    private val tokenStorage: SecureTokenStorage,
) {
    fun installOn(client: io.ktor.client.HttpClient) {
        client.plugin(HttpSend).intercept { request ->
            tokenStorage.readTokens()?.let { tokens ->
                request.bearerAuth(tokens.accessToken)
                tokens.deviceId?.let { request.header("X-Device-ID", it) }
            }
            execute(request)
        }
    }
}
