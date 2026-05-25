package com.examio.app.features.auth.api

import com.examio.app.core.network.ApiEndpoints
import com.examio.app.core.network.ApiResult
import com.examio.app.core.network.safeApiCall
import com.examio.app.features.auth.models.AuthResponse
import com.examio.app.features.auth.models.ForgotPasswordRequest
import com.examio.app.features.auth.models.LoginRequest
import com.examio.app.features.auth.models.MessageResponse
import com.examio.app.features.auth.models.ResetPasswordRequest
import com.examio.app.features.auth.models.SignupRequest
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody

class AuthApiService(private val client: HttpClient) {
    suspend fun login(request: LoginRequest): ApiResult<AuthResponse> =
        safeApiCall { client.post(ApiEndpoints.LOGIN) { setBody(request) } }

    suspend fun signup(request: SignupRequest): ApiResult<AuthResponse> =
        safeApiCall { client.post(ApiEndpoints.SIGNUP) { setBody(request) } }

    suspend fun logout(): ApiResult<MessageResponse> =
        safeApiCall { client.post(ApiEndpoints.LOGOUT) }

    suspend fun forgotPassword(request: ForgotPasswordRequest): ApiResult<MessageResponse> =
        safeApiCall { client.post(ApiEndpoints.FORGOT_PASSWORD) { setBody(request) } }

    suspend fun resetPassword(request: ResetPasswordRequest): ApiResult<MessageResponse> =
        safeApiCall { client.post(ApiEndpoints.RESET_PASSWORD) { setBody(request) } }
}
