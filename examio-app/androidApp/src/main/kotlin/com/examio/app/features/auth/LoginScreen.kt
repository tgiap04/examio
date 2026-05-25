package com.examio.app.features.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
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
fun LoginScreen(
    state: AuthUiState,
    onLogin: (String, String) -> Unit,
    onRegister: () -> Unit,
    onForgotPassword: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var credential by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    AuthShell("Chào mừng trở lại", "Đăng nhập Examio để tiếp tục học và thi.", modifier) {
        AuthTextField(credential, "Email hoặc username", { credential = it })
        AuthTextField(password, "Mật khẩu", { password = it }, isPassword = true)
        AuthMessage(state.errorMessage, state.successMessage)
        AuthPrimaryButton("Đăng nhập", state.isLoading, { onLogin(credential.trim(), password) })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = onForgotPassword) { Text("Quên mật khẩu") }
            TextButton(onClick = onRegister) { Text("Tạo tài khoản") }
        }
    }
}
