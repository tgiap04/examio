package com.examio.app.core.network

import platform.Foundation.NSData
import platform.posix.memcpy
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned

actual class PlatformFile(
    actual val filename: String,
    actual val mimeType: String,
    private val nsData: NSData,
) {
    @OptIn(ExperimentalForeignApi::class)
    actual suspend fun readBytes(): ByteArray {
        val size = nsData.length.toInt()
        val bytes = ByteArray(size)
        bytes.usePinned { pinned ->
            memcpy(pinned.addressOf(0), nsData.bytes, nsData.length)
        }
        return bytes
    }
}
