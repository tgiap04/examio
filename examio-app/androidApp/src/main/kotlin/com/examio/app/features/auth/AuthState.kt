package com.examio.app.features.auth

enum class AuthScreen { Login, Register, ForgotPassword, ResetPassword }

data class AuthUiState(
    val isAuthenticated: Boolean = false,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val successMessage: String? = null,
)

fun Throwable.toAuthMessage(): String = message ?: "Không thể kết nối Examio. Vui lòng thử lại."
