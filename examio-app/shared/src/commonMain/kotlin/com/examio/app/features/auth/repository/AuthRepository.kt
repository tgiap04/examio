package com.examio.app.features.auth.repository

import com.examio.app.core.network.ApiResult
import com.examio.app.core.session.SessionTokens
import com.examio.app.core.storage.SecureTokenStorage
import com.examio.app.features.auth.api.AuthApiService
import com.examio.app.features.auth.models.AuthResponse
import com.examio.app.features.auth.models.CurrentUserResponse
import com.examio.app.features.auth.models.ForgotPasswordRequest
import com.examio.app.features.auth.models.LoginRequest
import com.examio.app.features.auth.models.MessageResponse
import com.examio.app.features.auth.models.ResetPasswordRequest
import com.examio.app.features.auth.models.SignupRequest

class AuthRepository(
    private val api: AuthApiService,
    private val tokenStorage: SecureTokenStorage,
) {
    suspend fun restoreSession(): ApiResult<CurrentUserResponse> {
        val tokens = tokenStorage.readTokens() ?: return ApiResult.NetworkError("Chưa có phiên đăng nhập.")
        val currentUser = api.currentUser()
        if (currentUser is ApiResult.Success) return currentUser

        val refreshed = api.refresh(tokens.refreshToken)
        if (refreshed is ApiResult.Success && persistTokens(refreshed.data)) {
            return api.currentUser()
        }

        if (currentUser is ApiResult.HttpError && currentUser.statusCode in setOf(401, 403)) {
            tokenStorage.clearTokens()
        }
        return currentUser
    }

    suspend fun login(credential: String, password: String): ApiResult<AuthResponse> {
        val result = api.login(LoginRequest(credential, password))
        persistTokens(result)
        return result
    }

    suspend fun signup(request: SignupRequest): ApiResult<AuthResponse> {
        val result = api.signup(request)
        persistTokens(result)
        return result
    }

    suspend fun logout(): ApiResult<MessageResponse> {
        val result = api.logout()
        tokenStorage.clearTokens()
        return result
    }

    suspend fun forgotPassword(email: String): ApiResult<MessageResponse> = api.forgotPassword(ForgotPasswordRequest(email))

    suspend fun resetPassword(email: String?, code: String, password: String): ApiResult<MessageResponse> =
        api.resetPassword(ResetPasswordRequest(email = email, code = code, newPassword = password))

    suspend fun saveOAuthTokens(response: AuthResponse): Boolean {
        return persistTokens(response)
    }

    private suspend fun persistTokens(result: ApiResult<AuthResponse>) {
        if (result is ApiResult.Success) persistTokens(result.data)
    }

    private suspend fun persistTokens(response: AuthResponse): Boolean {
        val accessToken = response.accessToken ?: response.token ?: return false
        tokenStorage.saveTokens(
            SessionTokens(
                accessToken = accessToken,
                refreshToken = response.refreshToken,
                sessionId = response.sessionId,
                deviceId = response.deviceId,
            ),
        )
        return true
    }
}
