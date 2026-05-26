package com.examio.app.backend

import android.content.Context
import com.examio.app.BuildConfig
import com.examio.app.core.config.AppConfig
import com.examio.app.core.config.MobileApiConfig
import com.examio.app.core.network.HttpClientFactory
import com.examio.app.features.auth.api.AuthApiService
import com.examio.app.features.auth.repository.AuthRepository

class AndroidAppContainer(context: Context) {
    private val tokenStorage = AndroidSecureTokenStorage(context.applicationContext)
    private val httpClient = HttpClientFactory.create(
        config = AppConfig(
            apiBaseUrl = MobileApiConfig.apiBaseUrl,
            environmentName = if (BuildConfig.DEBUG) "debug" else "release",
        ),
        tokenStorage = tokenStorage,
    )

    val authRepository = AuthRepository(
        api = AuthApiService(httpClient),
        tokenStorage = tokenStorage,
    )
}
