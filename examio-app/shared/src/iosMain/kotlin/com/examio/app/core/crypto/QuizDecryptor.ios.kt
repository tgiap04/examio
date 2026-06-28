@file:OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)

package com.examio.app.core.crypto

import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.alloc
import kotlinx.cinterop.convert
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.ptr
import kotlinx.cinterop.usePinned
import kotlinx.cinterop.value
import platform.CoreCrypto.CCCrypt
import platform.CoreCrypto.kCCAlgorithmAES
import platform.CoreCrypto.kCCBlockSizeAES128
import platform.CoreCrypto.kCCDecrypt
import platform.CoreCrypto.kCCKeySizeAES256
import platform.CoreCrypto.kCCOptionPKCS7Padding
import platform.CoreCrypto.kCCSuccess
import platform.Foundation.NSData
import platform.Foundation.create
import platform.posix.memcpy
import platform.posix.size_tVar

actual class QuizDecryptor actual constructor(aesKey: String) {
    private val keyBytes = normalizeQuizKey(aesKey).encodeToByteArray()

    actual fun decrypt(ciphertext: String): String {
        return try {
            val dot = ciphertext.indexOf('.')
            if (dot <= 0 || dot == ciphertext.length - 1) return DECRYPT_ERROR
            val iv = base64Decode(ciphertext.substring(0, dot)) ?: return DECRYPT_ERROR
            val data = base64Decode(ciphertext.substring(dot + 1)) ?: return DECRYPT_ERROR
            if (data.isEmpty()) return DECRYPT_ERROR

            val out = ByteArray(data.size + kCCBlockSizeAES128.toInt())
            val plain = aesCbcDecrypt(keyBytes, iv, data, out) ?: return DECRYPT_ERROR
            plain.decodeToString()
        } catch (e: Throwable) {
            DECRYPT_ERROR
        }
    }

    private fun aesCbcDecrypt(
        key: ByteArray,
        iv: ByteArray,
        data: ByteArray,
        out: ByteArray,
    ): ByteArray? = memScoped {
        val numBytesDecrypted = alloc<size_tVar>()
        val status = key.usePinned { keyPin ->
            iv.usePinned { ivPin ->
                data.usePinned { dataPin ->
                    out.usePinned { outPin ->
                        CCCrypt(
                            op = kCCDecrypt,
                            alg = kCCAlgorithmAES,
                            options = kCCOptionPKCS7Padding,
                            key = keyPin.addressOf(0),
                            keyLength = kCCKeySizeAES256.convert(),
                            iv = ivPin.addressOf(0),
                            dataIn = dataPin.addressOf(0),
                            dataInLength = data.size.convert(),
                            dataOut = outPin.addressOf(0),
                            dataOutAvailable = out.size.convert(),
                            dataOutMoved = numBytesDecrypted.ptr,
                        )
                    }
                }
            }
        }
        if (status != kCCSuccess) return@memScoped null
        out.copyOf(numBytesDecrypted.value.toInt())
    }

    private fun base64Decode(s: String): ByteArray? {
        val nsData = NSData.create(base64EncodedString = s, options = 0u) ?: return null
        val len = nsData.length.toInt()
        if (len == 0) return ByteArray(0)
        val bytes = ByteArray(len)
        bytes.usePinned { pinned ->
            memcpy(pinned.addressOf(0), nsData.bytes, len.convert())
        }
        return bytes
    }
}
