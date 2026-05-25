package com.examio.app.features.auth.repository

import com.examio.app.core.network.ApiResult
import com.examio.app.core.session.SessionTokens
import com.examio.app.core.storage.SecureTokenStorage
import com.examio.app.features.auth.api.AuthApiService
import com.examio.app.features.auth.models.AuthResponse
import com.examio.app.features.auth.models.ForgotPasswordRequest
import com.examio.app.features.auth.models.LoginRequest
import com.examio.app.features.auth.models.MessageResponse
import com.examio.app.features.auth.models.ResetPasswordRequest
import com.examio.app.features.auth.models.SignupRequest

class AuthRepository(
    private val api: AuthApiService,
    private val tokenStorage: SecureTokenStorage,
) {
    suspend fun login(email: String, password: String): ApiResult<AuthResponse> =
        api.login(LoginRequest(email, password)).also(::persistTokens)

    suspend fun signup(request: SignupRequest): ApiResult<AuthResponse> = api.signup(request).also(::persistTokens)

    suspend fun logout(): ApiResult<MessageResponse> {
        val result = api.logout()
        tokenStorage.clearTokens()
        return result
    }

    suspend fun forgotPassword(email: String): ApiResult<MessageResponse> = api.forgotPassword(ForgotPasswordRequest(email))

    suspend fun resetPassword(token: String, password: String): ApiResult<MessageResponse> =
        api.resetPassword(ResetPasswordRequest(token, password))

    private suspend fun persistTokens(result: ApiResult<AuthResponse>) {
        if (result is ApiResult.Success) {
            tokenStorage.saveTokens(SessionTokens(result.data.accessToken, result.data.refreshToken))
        }
    }
}
