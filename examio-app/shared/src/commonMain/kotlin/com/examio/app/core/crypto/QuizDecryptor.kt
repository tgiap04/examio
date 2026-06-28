package com.examio.app.core.crypto

/**
 * AES-256-CBC decryptor for secure-quiz content.
 *
 * Mirrors examio-fe/src/lib/crypto.ts exactly:
 *  - ciphertext format is "ivBase64.ciphertextBase64" (split on '.')
 *  - mode CBC, padding PKCS7
 *  - key is the UTF-8 bytes of aesKey.padEnd(32, '!').take(32)
 *
 * The same [aesKey] string the server/FE use MUST be supplied (raw, un-sliced);
 * slicing/padding happens here so all platforms agree byte-for-byte.
 */
expect class QuizDecryptor(aesKey: String) {
    /** Decrypts a single field; returns the plaintext or "[Lỗi giải mã]" on failure. */
    fun decrypt(ciphertext: String): String
}

/** Normalize the key to exactly 32 UTF-8 bytes, matching FE's padEnd(32,'!').slice(0,32). */
internal fun normalizeQuizKey(aesKey: String): String =
    aesKey.padEnd(32, '!').substring(0, 32)

/** Shared error sentinel so all platforms return the same string FE shows. */
internal const val DECRYPT_ERROR = "[Lỗi giải mã]"
