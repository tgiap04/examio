package com.examio.app.features.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.examio.app.BuildConfig
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

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
    var confirmPassword by remember { mutableStateOf("") }
    val uriHandler = LocalUriHandler.current
    val passwordMismatch = confirmPassword.isNotEmpty() && password != confirmPassword

    AuthCardShell(
        title = "Đăng Ký",
        subtitle = "Chào Mừng Đến Với Examio — bắt đầu học, luyện đề và quản lý tài liệu.",
        modifier = modifier,
    ) {
        AuthTextField(username, "Tên Đăng Nhập", { username = it },
            leadingIcon = { Icon(Icons.Outlined.Person, contentDescription = null) })
        AuthTextField(email, "Email", { email = it },
            leadingIcon = { Icon(Icons.Outlined.Email, contentDescription = null) })
        AuthTextField(password, "Mật Khẩu", { password = it }, isPassword = true,
            leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null) })
        AuthTextField(confirmPassword, "Nhập Lại Mật Khẩu", { confirmPassword = it }, isPassword = true,
            leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null) })

        if (passwordMismatch) {
            Text("Mật khẩu nhập lại không khớp.", color = Color(0xFFC64545),
                style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
        }

        AuthMessage(state.errorMessage, state.successMessage)

        Button(
            onClick = { onRegister(username.trim(), email.trim(), password) },
            enabled = !state.isLoading && !passwordMismatch && password == confirmPassword && password.length >= 6,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFCC785C)),
        ) {
            Text(if (state.isLoading) "Đang xử lý..." else "Đăng Ký →", fontWeight = FontWeight.SemiBold)
        }

        AuthOrDivider()

        OutlinedButton(
            onClick = {
                val redirect = URLEncoder.encode("examio://auth/callback", StandardCharsets.UTF_8.toString())
                uriHandler.openUri("${BuildConfig.API_BASE_URL}/api/v1/auth/google?redirect=$redirect")
            },
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, Color(0xFFE4D7CA)),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = Color(0xFFFFFBF7)),
        ) {
            Text("G", color = Color(0xFF4285F4), fontWeight = FontWeight.Black, fontSize = 18.sp)
            androidx.compose.foundation.layout.Spacer(Modifier.size(10.dp))
            Text("Google", color = Color(0xFF3D3D3A), fontWeight = FontWeight.Medium)
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Đã có tài khoản?", color = Color(0xFF6B625B),
                style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
            TextButton(onClick = onBackToLogin) { Text("Đăng Nhập") }
        }
    }
}
