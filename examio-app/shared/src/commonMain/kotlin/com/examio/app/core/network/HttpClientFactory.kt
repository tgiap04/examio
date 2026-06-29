package com.examio.app.core.network

import com.examio.app.core.config.AppConfig
import com.examio.app.core.storage.SecureTokenStorage
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.accept
import io.ktor.client.request.url
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

object HttpClientFactory {
    fun create(
        config: AppConfig,
        tokenStorage: SecureTokenStorage,
    ): HttpClient {
        val client = HttpClient {
            expectSuccess = true
            install(ContentNegotiation) {
                json(Json {
                    ignoreUnknownKeys = true
                    isLenient = true
                })
            }
            install(HttpTimeout) {
                requestTimeoutMillis = 30_000
                connectTimeoutMillis = 15_000
                socketTimeoutMillis = 30_000
            }
            install(Logging) { level = LogLevel.INFO }
            defaultRequest {
                url(config.apiBaseUrl)
                contentType(ContentType.Application.Json)
                accept(ContentType.Application.Json)
            }
        }
        AuthInterceptor(tokenStorage, config).installOn(client)
        return client
    }
}
