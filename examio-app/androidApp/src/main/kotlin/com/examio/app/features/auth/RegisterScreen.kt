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
fun RegisterScreen(
    state: AuthUiState,
    onRegister: (String, String, String) -> Unit,
    onBackToLogin: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    AuthShell("Tạo tài khoản", "Bắt đầu quản lý tài liệu, flashcard và kỳ thi.", modifier) {
        AuthTextField(username, "Username", { username = it })
        AuthTextField(email, "Email", { email = it })
        AuthTextField(password, "Mật khẩu", { password = it }, isPassword = true)
        AuthMessage(state.errorMessage, state.successMessage)
        AuthPrimaryButton("Đăng ký", state.isLoading, { onRegister(username.trim(), email.trim(), password) })
        TextButton(onClick = onBackToLogin) { Text("Đã có tài khoản? Đăng nhập") }
    }
}
