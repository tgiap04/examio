package com.examio.app.features.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun AuthNavGraph(
    onAuthenticated: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var screen by remember { mutableStateOf(AuthScreen.Login) }
    var state by remember { mutableStateOf(AuthUiState()) }

    fun submit(success: String) {
        state = AuthUiState(isLoading = true)
        state = AuthUiState(successMessage = success)
    }

    when (screen) {
        AuthScreen.Login -> LoginScreen(
            state = state,
            onLogin = { credential, password ->
                state = validateLogin(credential, password) ?: AuthUiState(isAuthenticated = true)
                if (state.isAuthenticated) onAuthenticated()
            },
            onRegister = { state = AuthUiState(); screen = AuthScreen.Register },
            onForgotPassword = { state = AuthUiState(); screen = AuthScreen.ForgotPassword },
            modifier = modifier,
        )
        AuthScreen.Register -> RegisterScreen(
            state = state,
            onRegister = { username, email, password ->
                state = validateRegister(username, email, password) ?: AuthUiState(isAuthenticated = true)
                if (state.isAuthenticated) onAuthenticated()
            },
            onBackToLogin = { state = AuthUiState(); screen = AuthScreen.Login },
            modifier = modifier,
        )
        AuthScreen.ForgotPassword -> ForgotPasswordScreen(
            state = state,
            onSendCode = { email -> state = validateEmail(email) ?: AuthUiState(successMessage = "Mã khôi phục đã được gửi.") },
            onResetPassword = { state = AuthUiState(); screen = AuthScreen.ResetPassword },
            onBackToLogin = { state = AuthUiState(); screen = AuthScreen.Login },
            modifier = modifier,
        )
        AuthScreen.ResetPassword -> ResetPasswordScreen(
            state = state,
            onReset = { code, password -> state = validateReset(code, password) ?: AuthUiState(successMessage = "Mật khẩu đã được cập nhật.") },
            onBackToLogin = { state = AuthUiState(); screen = AuthScreen.Login },
            modifier = modifier,
        )
    }
}

@Composable
fun AuthShell(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, color = MaterialTheme.colorScheme.onBackground, style = MaterialTheme.typography.headlineLarge)
        Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(24.dp))
        content()
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
