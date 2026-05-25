package com.examio.app.features.auth

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.examio.app.core.network.ApiResult
import com.examio.app.features.auth.models.SignupRequest
import com.examio.app.features.auth.models.User
import com.examio.app.features.auth.repository.AuthRepository
import kotlinx.coroutines.launch

@Composable
fun AuthNavGraph(
    authRepository: AuthRepository,
    onAuthenticated: (User?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var screen by remember { mutableStateOf(AuthScreen.Login) }
    var state by remember { mutableStateOf(AuthUiState()) }

    when (screen) {
        AuthScreen.Login -> LoginScreen(
            state = state,
            onLogin = { credential, password ->
                validateLogin(credential, password)?.let { state = it; return@LoginScreen }
                scope.launch {
                    state = AuthUiState(isLoading = true)
                    when (val result = authRepository.login(credential, password)) {
                        is ApiResult.Success -> {
                            state = AuthUiState(isAuthenticated = true)
                            onAuthenticated(result.data.user)
                        }
                        is ApiResult.HttpError -> state = AuthUiState(errorMessage = result.message)
                        is ApiResult.NetworkError -> state = AuthUiState(errorMessage = result.message)
                    }
                }
            },
            onRegister = { state = AuthUiState(); screen = AuthScreen.Register },
            onForgotPassword = { state = AuthUiState(); screen = AuthScreen.ForgotPassword },
            modifier = modifier,
        )
        AuthScreen.Register -> RegisterScreen(
            state = state,
            onRegister = { username, email, password ->
                validateRegister(username, email, password)?.let { state = it; return@RegisterScreen }
                scope.launch {
                    state = AuthUiState(isLoading = true)
                    val request = SignupRequest(username = username, email = email, password = password)
                    when (val result = authRepository.signup(request)) {
                        is ApiResult.Success -> {
                            state = AuthUiState(isAuthenticated = true)
                            onAuthenticated(result.data.user)
                        }
                        is ApiResult.HttpError -> state = AuthUiState(errorMessage = result.message)
                        is ApiResult.NetworkError -> state = AuthUiState(errorMessage = result.message)
                    }
                }
            },
            onBackToLogin = { state = AuthUiState(); screen = AuthScreen.Login },
            modifier = modifier,
        )
        AuthScreen.ForgotPassword -> ForgotPasswordScreen(
            state = state,
            onSendCode = { email ->
                validateEmail(email)?.let { state = it; return@ForgotPasswordScreen }
                scope.launch {
                    state = AuthUiState(isLoading = true)
                    state = when (val result = authRepository.forgotPassword(email)) {
                        is ApiResult.Success -> AuthUiState(successMessage = result.data.message ?: "Mã khôi phục đã được gửi.")
                        is ApiResult.HttpError -> AuthUiState(errorMessage = result.message)
                        is ApiResult.NetworkError -> AuthUiState(errorMessage = result.message)
                    }
                }
            },
            onResetPassword = { state = AuthUiState(); screen = AuthScreen.ResetPassword },
            onBackToLogin = { state = AuthUiState(); screen = AuthScreen.Login },
            modifier = modifier,
        )
        AuthScreen.ResetPassword -> ResetPasswordScreen(
            state = state,
            onReset = { code, password ->
                validateReset(code, password)?.let { state = it; return@ResetPasswordScreen }
                scope.launch {
                    state = AuthUiState(isLoading = true)
                    state = when (val result = authRepository.resetPassword(email = null, code = code, password = password)) {
                        is ApiResult.Success -> AuthUiState(successMessage = result.data.message ?: "Mật khẩu đã được cập nhật.")
                        is ApiResult.HttpError -> AuthUiState(errorMessage = result.message)
                        is ApiResult.NetworkError -> AuthUiState(errorMessage = result.message)
                    }
                }
            },
            onBackToLogin = { state = AuthUiState(); screen = AuthScreen.Login },
            modifier = modifier,
        )
    }
}

private fun validateLogin(credential: String, password: String): AuthUiState? = when {
    credential.isBlank() -> AuthUiState(errorMessage = "Vui lòng nhập email hoặc tên đăng nhập.")
    password.length < 6 -> AuthUiState(errorMessage = "Mật khẩu cần ít nhất 6 ký tự.")
    else -> null
}

private fun validateRegister(username: String, email: String, password: String): AuthUiState? = when {
    username.isBlank() -> AuthUiState(errorMessage = "Vui lòng nhập username.")
    !email.contains("@") -> AuthUiState(errorMessage = "Email không hợp lệ.")
    password.length < 6 -> AuthUiState(errorMessage = "Mật khẩu cần ít nhất 6 ký tự.")
    else -> null
}

private fun validateEmail(email: String): AuthUiState? =
    if (!email.contains("@")) AuthUiState(errorMessage = "Email không hợp lệ.") else null

private fun validateReset(code: String, password: String): AuthUiState? = when {
    code.isBlank() -> AuthUiState(errorMessage = "Vui lòng nhập mã khôi phục.")
    password.length < 6 -> AuthUiState(errorMessage = "Mật khẩu cần ít nhất 6 ký tự.")
    else -> null
}
