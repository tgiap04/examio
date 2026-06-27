package com.examio.app.core.network

actual class PlatformFile(
    actual val filename: String,
    actual val mimeType: String,
    private val bytes: ByteArray,
) {
    actual suspend fun readBytes(): ByteArray = bytes
}
