package com.examio.app.features.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Email
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
fun ForgotPasswordScreen(
    state: AuthUiState,
    onSendCode: (String) -> Unit,
    onResetPassword: () -> Unit,
    onBackToLogin: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var email by remember { mutableStateOf("") }

    AuthCardShell(
        title = "Khôi Phục Mật Khẩu",
        subtitle = "Nhập email để nhận mã khôi phục mật khẩu.",
        modifier = modifier,
    ) {
        AuthTextField(email, "Email", { email = it },
            leadingIcon = { Icon(Icons.Outlined.Email, contentDescription = null) })

        AuthMessage(state.errorMessage, state.successMessage)

        Button(
            onClick = { onSendCode(email.trim()) },
            enabled = !state.isLoading && email.contains("@"),
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFCC785C)),
        ) {
            Text(if (state.isLoading) "Đang xử lý..." else "Gửi Mã Khôi Phục", fontWeight = FontWeight.SemiBold)
        }

        Button(
            onClick = onResetPassword,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0x1FCC785C)),
        ) {
            Text("Tôi đã có mã →", color = Color(0xFFCC785C), fontWeight = FontWeight.Medium)
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
