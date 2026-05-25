package com.examio.app.features.auth.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(val credential: String, val password: String)

@Serializable
data class SignupRequest(
    val email: String,
    val password: String,
    val username: String,
    val name: String? = null,
)

@Serializable
data class AuthResponse(
    val success: Boolean = true,
    val message: String? = null,
    val token: String? = null,
    val accessToken: String? = token,
    val refreshToken: String? = null,
    val sessionId: String? = null,
    val deviceId: String? = null,
    val redirectTo: String? = null,
    val user: User? = null,
)

@Serializable
data class CurrentUserResponse(val user: User)

@Serializable
data class ForgotPasswordRequest(val email: String)

@Serializable
data class ResetPasswordRequest(
    val email: String? = null,
    val code: String,
    @SerialName("newPassword") val newPassword: String,
)

@Serializable
data class RefreshTokenRequest(val refreshToken: String? = null)

@Serializable
data class MessageResponse(
    val success: Boolean = true,
    val message: String? = null,
)
