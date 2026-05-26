package com.examio.app.features.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MailOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.examio.app.R
import com.examio.app.core.config.MobileApiConfig

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
    val uriHandler = LocalUriHandler.current

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFFFFF7EE), Color(0xFFFAF9F5), Color(0xFFEFE9DE)),
                ),
            ),
    ) {
        Box(
            Modifier
                .padding(top = 48.dp, start = 24.dp)
                .size(150.dp)
                .clip(CircleShape)
                .background(Color(0x33CC785C)),
        )
        Box(
            Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = 24.dp, end = 8.dp)
                .size(210.dp)
                .clip(CircleShape)
                .background(Color(0x26F2B66D)),
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            AuthBrandHeader()
            Spacer(Modifier.height(22.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(28.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xF8FFFCF8)),
                elevation = CardDefaults.cardElevation(defaultElevation = 10.dp),
                border = BorderStroke(1.dp, Color(0xFFE8D7C8)),
            ) {
                Column(
                    modifier = Modifier.padding(22.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Text(
                        "Chào Mừng Trở Lại",
                        color = Color(0xFF141413),
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        "Đăng nhập vào Examio để tiếp tục học, luyện đề và quản lý tài liệu.",
                        color = Color(0xFF6B625B),
                        style = MaterialTheme.typography.bodyMedium,
                    )

                    AuthTextField(
                        value = credential,
                        label = "Tên Đăng Nhập hoặc Email",
                        onValueChange = { credential = it },
                        leadingIcon = { Icon(Icons.Outlined.MailOutline, contentDescription = null) },
                    )
                    AuthTextField(
                        value = password,
                        label = "Mật Khẩu",
                        onValueChange = { password = it },
                        isPassword = true,
                        leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null) },
                    )

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = onForgotPassword) { Text("Quên mật khẩu?") }
                    }

                    AuthMessage(state.errorMessage, state.successMessage)

                    Button(
                        onClick = { onLogin(credential.trim(), password) },
                        enabled = !state.isLoading,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFCC785C)),
                    ) {
                        Text(if (state.isLoading) "Đang xử lý..." else "Đăng Nhập", fontWeight = FontWeight.SemiBold)
                    }

                    AuthOrDivider()

                    OutlinedButton(
                        onClick = { uriHandler.openUri(MobileApiConfig.googleOAuthUrl()) },
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(1.dp, Color(0xFFE4D7CA)),
                        colors = ButtonDefaults.outlinedButtonColors(containerColor = Color(0xFFFFFBF7)),
                    ) {
                        Text("G", color = Color(0xFF4285F4), fontWeight = FontWeight.Black, fontSize = 18.sp)
                        Spacer(Modifier.size(10.dp))
                        Text("Google", color = Color(0xFF3D3D3A), fontWeight = FontWeight.Medium)
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Bạn chưa có tài khoản?", color = Color(0xFF6B625B), style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = onRegister) { Text("Đăng ký ngay") }
                    }
                }
            }
        }
    }
}

@Composable
internal fun AuthBrandHeader() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(78.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(Color(0x1FCC785C))
                .border(1.dp, Color(0x40CC785C), RoundedCornerShape(24.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(R.drawable.examio_lightmode),
                contentDescription = "Examio",
                modifier = Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)),
                contentScale = ContentScale.Crop,
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = Color(0xFFCC785C), modifier = Modifier.size(18.dp))
            Text("Nền tảng học tập cùng AI", color = Color(0xFF6B625B), style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
internal fun AuthOrDivider() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Divider(Modifier.weight(1f), color = Color(0xFFE4D7CA))
        Text("Hoặc tiếp tục với", color = Color(0xFF8A8077), style = MaterialTheme.typography.bodySmall)
        Divider(Modifier.weight(1f), color = Color(0xFFE4D7CA))
    }
}
