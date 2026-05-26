package com.examio.app.core.storage

import android.content.Context
import com.examio.app.core.session.SessionTokens

private lateinit var _instance: SecureTokenStorage

fun initSecureTokenStorage(context: Context) {
    _instance = AndroidSecureTokenStorageImpl(context.applicationContext)
}

actual fun createSecureTokenStorage(): SecureTokenStorage = _instance

private class AndroidSecureTokenStorageImpl(context: Context) : SecureTokenStorage {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override suspend fun readTokens(): SessionTokens? {
        val access = decrypt(prefs.getString(KEY_ACCESS, null)) ?: return null
        return SessionTokens(
            accessToken = access,
            refreshToken = decrypt(prefs.getString(KEY_REFRESH, null)),
            sessionId = decrypt(prefs.getString(KEY_SESSION, null)),
            deviceId = decrypt(prefs.getString(KEY_DEVICE, null)),
        )
    }

    override suspend fun saveTokens(tokens: SessionTokens) {
        prefs.edit()
            .putString(KEY_ACCESS, encrypt(tokens.accessToken))
            .putString(KEY_REFRESH, encrypt(tokens.refreshToken))
            .putString(KEY_SESSION, encrypt(tokens.sessionId))
            .putString(KEY_DEVICE, encrypt(tokens.deviceId))
            .apply()
    }

    override suspend fun clearTokens() {
        prefs.edit().clear().apply()
    }

    private fun encrypt(value: String?): String? {
        if (value.isNullOrBlank()) return null
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        val payload = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return android.util.Base64.encodeToString(payload, android.util.Base64.NO_WRAP)
    }

    private fun decrypt(value: String?): String? {
        if (value.isNullOrBlank()) return null
        return runCatching {
            val payload = android.util.Base64.decode(value, android.util.Base64.NO_WRAP)
            val iv = payload.copyOfRange(0, GCM_IV_SIZE)
            val encrypted = payload.copyOfRange(GCM_IV_SIZE, payload.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), javax.crypto.spec.GCMParameterSpec(GCM_TAG_SIZE, iv))
            cipher.doFinal(encrypted).toString(Charsets.UTF_8)
        }.getOrNull()
    }

    private fun getOrCreateSecretKey(): javax.crypto.SecretKey {
        val keyStore = java.security.KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getEntry(KEY_ALIAS, null) as? java.security.KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        return javax.crypto.KeyGenerator.getInstance(
            android.security.keystore.KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE,
        ).run {
            init(android.security.keystore.KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
            )
            generateKey()
        }
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val GCM_IV_SIZE = 12
        const val GCM_TAG_SIZE = 128
        const val KEY_ACCESS = "access_token"
        const val KEY_ALIAS = "examio_mobile_session"
        const val KEY_DEVICE = "device_id"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_SESSION = "session_id"
        const val PREFS_NAME = "examio_secure_session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
