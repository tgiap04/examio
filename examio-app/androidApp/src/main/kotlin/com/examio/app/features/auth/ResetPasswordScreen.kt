package com.examio.app.features.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun ResetPasswordScreen(
    state: AuthUiState,
    onReset: (String, String) -> Unit,
    onBackToLogin: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var code by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    val passwordMismatch = confirmPassword.isNotEmpty() && password != confirmPassword

    AuthCardShell(
        title = "Đặt Lại Mật Khẩu",
        subtitle = "Nhập mã khôi phục và mật khẩu mới của bạn.",
        modifier = modifier,
    ) {
        AuthTextField(code, "Mã Khôi Phục", { code = it },
            leadingIcon = { Icon(Icons.Outlined.Key, contentDescription = null) })
        AuthTextField(password, "Mật Khẩu Mới", { password = it }, isPassword = true,
            leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null) })
        AuthTextField(confirmPassword, "Nhập Lại Mật Khẩu", { confirmPassword = it }, isPassword = true,
            leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null) })

        if (passwordMismatch) {
            Text("Mật khẩu nhập lại không khớp.", color = Color(0xFFC64545),
                style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
        }

        AuthMessage(state.errorMessage, state.successMessage)

        Button(
            onClick = { onReset(code.trim(), password) },
            enabled = !state.isLoading && code.isNotBlank() && password.length >= 6 && password == confirmPassword,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFCC785C)),
        ) {
            Text(if (state.isLoading) "Đang xử lý..." else "Cập Nhật Mật Khẩu", fontWeight = FontWeight.SemiBold)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Nhớ mật khẩu rồi?", color = Color(0xFF6B625B),
                style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
            TextButton(onClick = onBackToLogin) { Text("Đăng Nhập") }
        }
    }
}
