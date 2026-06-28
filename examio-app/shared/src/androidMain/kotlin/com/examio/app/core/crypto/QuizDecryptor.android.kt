package com.examio.app.core.crypto

import android.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

actual class QuizDecryptor actual constructor(aesKey: String) {
    private val keyBytes = normalizeQuizKey(aesKey).toByteArray(Charsets.UTF_8)

    actual fun decrypt(ciphertext: String): String {
        return try {
            val dot = ciphertext.indexOf('.')
            if (dot <= 0 || dot == ciphertext.length - 1) return DECRYPT_ERROR
            val iv = Base64.decode(ciphertext.substring(0, dot), Base64.DEFAULT)
            val data = Base64.decode(ciphertext.substring(dot + 1), Base64.DEFAULT)
            val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                SecretKeySpec(keyBytes, "AES"),
                IvParameterSpec(iv),
            )
            String(cipher.doFinal(data), Charsets.UTF_8)
        } catch (e: Exception) {
            DECRYPT_ERROR
        }
    }
}
