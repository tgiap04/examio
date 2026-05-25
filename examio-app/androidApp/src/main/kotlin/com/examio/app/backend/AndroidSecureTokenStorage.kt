package com.examio.app.backend

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.examio.app.core.session.SessionTokens
import com.examio.app.core.storage.SecureTokenStorage
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class AndroidSecureTokenStorage(context: Context) : SecureTokenStorage {
    private val preferences: SharedPreferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    override suspend fun readTokens(): SessionTokens? {
        val accessToken = decrypt(preferences.getString(KEY_ACCESS_TOKEN, null)) ?: return null
        return SessionTokens(
            accessToken = accessToken,
            refreshToken = decrypt(preferences.getString(KEY_REFRESH_TOKEN, null)),
            sessionId = decrypt(preferences.getString(KEY_SESSION_ID, null)),
            deviceId = decrypt(preferences.getString(KEY_DEVICE_ID, null)),
        )
    }

    override suspend fun saveTokens(tokens: SessionTokens) {
        preferences.edit()
            .putString(KEY_ACCESS_TOKEN, encrypt(tokens.accessToken))
            .putString(KEY_REFRESH_TOKEN, encrypt(tokens.refreshToken))
            .putString(KEY_SESSION_ID, encrypt(tokens.sessionId))
            .putString(KEY_DEVICE_ID, encrypt(tokens.deviceId))
            .apply()
    }

    override suspend fun clearTokens() {
        preferences.edit().clear().apply()
    }

    private fun encrypt(value: String?): String? {
        if (value.isNullOrBlank()) return null
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        val payload = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(payload, Base64.NO_WRAP)
    }

    private fun decrypt(value: String?): String? {
        if (value.isNullOrBlank()) return null
        return runCatching {
            val payload = Base64.decode(value, Base64.NO_WRAP)
            val iv = payload.copyOfRange(0, GCM_IV_SIZE)
            val encrypted = payload.copyOfRange(GCM_IV_SIZE, payload.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), GCMParameterSpec(GCM_TAG_SIZE, iv))
            cipher.doFinal(encrypted).toString(Charsets.UTF_8)
        }.getOrNull()
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).run {
            init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
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
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_ALIAS = "examio_mobile_session"
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_REFRESH_TOKEN = "refresh_token"
        const val KEY_SESSION_ID = "session_id"
        const val PREFERENCES_NAME = "examio_secure_session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
