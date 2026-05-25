package com.examio.app.features.auth

import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

@Composable
fun ForgotPasswordScreen(
    state: AuthUiState,
    onSendCode: (String) -> Unit,
    onResetPassword: () -> Unit,
    onBackToLogin: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var email by remember { mutableStateOf("") }

    AuthShell("Khôi phục mật khẩu", "Nhập email để nhận mã khôi phục.", modifier) {
        AuthTextField(email, "Email", { email = it })
        AuthMessage(state.errorMessage, state.successMessage)
        AuthPrimaryButton("Gửi mã", state.isLoading, { onSendCode(email.trim()) })
        TextButton(onClick = onResetPassword) { Text("Tôi đã có mã") }
        TextButton(onClick = onBackToLogin) { Text("Quay lại đăng nhập") }
    }
}
