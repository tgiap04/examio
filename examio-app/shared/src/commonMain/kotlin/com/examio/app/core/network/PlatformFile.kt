package com.examio.app.core.network

// Platform-picked file payload for multipart uploads.
expect class PlatformFile {
    val filename: String
    val mimeType: String
    suspend fun readBytes(): ByteArray
}
