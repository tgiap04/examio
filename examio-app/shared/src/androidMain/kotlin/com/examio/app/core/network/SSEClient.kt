package com.examio.app.core.network

actual fun createSSEClient(): SSEClient = PlatformSSEClient()

private class PlatformSSEClient : SSEClient {
    override suspend fun stream(
        url: String,
        headers: Map<String, String>,
        onEvent: suspend (String) -> Unit,
    ) {
        throw NotImplementedError("SSE streaming is wired in Phase 6 when AI chat UI is implemented.")
    }
}
