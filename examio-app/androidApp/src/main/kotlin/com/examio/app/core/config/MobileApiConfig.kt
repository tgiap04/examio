package com.examio.app.core.config

import com.examio.app.BuildConfig
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

object MobileApiConfig {
    private const val API_PREFIX = "/api/v1"
    private const val OAUTH_CALLBACK_URL = "examio://auth/callback"

    val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/')
    val apiBaseUrl: String = "$baseUrl$API_PREFIX"

    fun googleOAuthUrl(): String {
        val redirect = URLEncoder.encode(OAUTH_CALLBACK_URL, StandardCharsets.UTF_8.toString())
        return "$apiBaseUrl/auth/google?redirect=$redirect"
    }
}
