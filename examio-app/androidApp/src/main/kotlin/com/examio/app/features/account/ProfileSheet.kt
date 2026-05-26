package com.examio.app.features.account

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ModalBottomSheet(onDismissRequest = onDismiss, modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Icon(
                    Icons.Outlined.AccountCircle,
                    contentDescription = null,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(Color(0x22CC785C))
                        .padding(12.dp),
                    tint = Color(0xFFCC785C),
                )
                Column {
                    Text("Tài khoản Examio", style = MaterialTheme.typography.titleLarge)
                    Text("Hồ sơ, ví và bảo mật", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            ProfileAction(icon = Icons.Outlined.CreditCard, title = "Ví của tôi", subtitle = "Số dư, gói học tập và giao dịch")
            ProfileAction(icon = Icons.Outlined.Lock, title = "Đổi mật khẩu", subtitle = "Cập nhật bảo mật tài khoản")
            ProfileAction(icon = Icons.Outlined.Logout, title = "Đăng xuất", subtitle = "Kết thúc phiên đăng nhập")
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun ProfileAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
) {
    ListItem(
        leadingContent = { Icon(icon, contentDescription = null, tint = Color(0xFFCC785C)) },
        headlineContent = { Text(title) },
        supportingContent = { Text(subtitle) },
        modifier = Modifier
            .clip(RoundedCornerShape(18.dp))
            .background(Color(0xFFFFF7F1)),
    )
}
