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
fun ResetPasswordScreen(
    state: AuthUiState,
    onReset: (String, String) -> Unit,
    onBackToLogin: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var code by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    AuthShell("Đặt lại mật khẩu", "Nhập mã khôi phục và mật khẩu mới.", modifier) {
        AuthTextField(code, "Mã khôi phục", { code = it })
        AuthTextField(password, "Mật khẩu mới", { password = it }, isPassword = true)
        AuthMessage(state.errorMessage, state.successMessage)
        AuthPrimaryButton("Cập nhật mật khẩu", state.isLoading, { onReset(code.trim(), password) })
        TextButton(onClick = onBackToLogin) { Text("Quay lại đăng nhập") }
    }
}
