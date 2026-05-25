package com.examio.app.core.network

interface SSEClient {
    suspend fun stream(
        url: String,
        headers: Map<String, String> = emptyMap(),
        onEvent: suspend (String) -> Unit,
    )
}

expect fun createSSEClient(): SSEClient
