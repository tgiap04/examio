package com.examio.app.features.account

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp

@Composable
fun AccountScreen(modifier: Modifier = Modifier) {
    var state by remember { mutableStateOf(AccountUiState()) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Tài khoản", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.onBackground)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AccountSection.entries.forEach { section ->
                FilterChip(
                    selected = state.selectedSection == section,
                    onClick = { state = state.copy(selectedSection = section) },
                    label = { Text(section.label) },
                )
            }
        }
        when (state.selectedSection) {
            AccountSection.Profile -> ProfileSection(state)
            AccountSection.Wallet -> WalletSection(state)
            AccountSection.Teacher -> TeacherSection()
            AccountSection.Settings -> SettingsSection()
        }
    }
}

@Composable
private fun ProfileSection(state: AccountUiState) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(22.dp)) {
            Column(modifier = Modifier.fillMaxWidth().padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Spacer(
                    Modifier
                        .height(72.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)),
                )
                Text(
                    state.displayName.take(1),
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.18f))
                        .padding(horizontal = 22.dp, vertical = 16.dp),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(state.displayName, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
                Text("@${state.username} · ${state.email}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(state.bio, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = {}) { Text("Chỉnh sửa hồ sơ") }
            }
        }
    }
}

@Composable
private fun WalletSection(state: AccountUiState) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f)), shape = RoundedCornerShape(22.dp)) {
            Column(modifier = Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Số dư ví", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
                Text(state.balance, color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.headlineMedium)
                Text("Gói hiện tại: ${state.subscription}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Text("Giao dịch gần đây", style = MaterialTheme.typography.titleMedium)
        state.transactions.forEach { transaction -> TransactionRow(transaction) }
        Button(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("Nâng cấp gói") }
    }
}

@Composable
private fun TeacherSection() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Giảng dạy", style = MaterialTheme.typography.titleMedium)
        Text("Lối vào nhanh cho nội dung teacher sẽ được mở khi role Teacher được cấp.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("Quản lý nội dung") }
    }
}

@Composable
private fun TransactionRow(transaction: TransactionItem) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(transaction.title, style = MaterialTheme.typography.titleSmall)
                Text(transaction.date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(transaction.amount, color = if (transaction.isPositive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun SettingsSection() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Bảo mật", style = MaterialTheme.typography.titleMedium)
        OutlinedButton(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("Đổi mật khẩu") }
        OutlinedButton(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("Đăng xuất") }
        Text("Token sẽ được lưu bằng secure storage theo từng nền tảng.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
    }
}

