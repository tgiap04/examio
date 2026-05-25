package com.examio.app.core.network

import com.examio.app.core.storage.SecureTokenStorage
import io.ktor.client.plugins.HttpSend
import io.ktor.client.plugins.plugin
import io.ktor.client.request.bearerAuth

class AuthInterceptor(
    private val tokenStorage: SecureTokenStorage,
) {
    fun installOn(client: io.ktor.client.HttpClient) {
        client.plugin(HttpSend).intercept { request ->
            tokenStorage.readTokens()?.accessToken?.let { request.bearerAuth(it) }
            execute(request)
        }
    }
}
