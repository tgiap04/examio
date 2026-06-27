package com.examio.app.features.account

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import com.examio.app.features.account.models.Transaction

@Composable
fun AccountScreen(
    profileState: ProfileState,
    walletState: WalletState,
    onUpdateProfile: (name: String?, bio: String?) -> Unit,
    onRefreshWallet: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var selectedSection by remember { mutableStateOf(AccountSection.Profile) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Tài khoản", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.onBackground)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AccountSection.entries.forEach { section ->
                FilterChip(
                    selected = selectedSection == section,
                    onClick = { selectedSection = section },
                    label = { Text(section.label) },
                )
            }
        }
        when (selectedSection) {
            AccountSection.Profile -> ProfileSection(state = profileState, onUpdateProfile = onUpdateProfile)
            AccountSection.Wallet -> WalletSection(state = walletState, onRefresh = onRefreshWallet)
            AccountSection.Teacher -> TeacherSection()
            AccountSection.Settings -> SettingsSection(onLogout = onLogout)
        }
    }
}

@Composable
private fun ProfileSection(
    state: ProfileState,
    onUpdateProfile: (String?, String?) -> Unit,
) {
    if (state.isLoading) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }
    state.error?.let { err ->
        Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }
    val profile = state.profile
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(22.dp),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Spacer(
                    Modifier
                        .height(72.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)),
                )
                val initial = profile?.name?.firstOrNull()?.toString()
                    ?: profile?.username?.firstOrNull()?.toString()
                    ?: "?"
                Text(
                    initial,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.18f))
                        .padding(horizontal = 22.dp, vertical = 16.dp),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    profile?.name ?: profile?.username ?: "—",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    "@${profile?.username ?: "—"} · ${profile?.email ?: ""}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                profile?.bio?.let { bio ->
                    if (bio.isNotBlank()) {
                        Text(bio, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                OutlinedButton(onClick = { onUpdateProfile(profile?.name, profile?.bio) }) {
                    Text("Chỉnh sửa hồ sơ")
                }
            }
        }
    }
}

@Composable
private fun WalletSection(
    state: WalletState,
    onRefresh: () -> Unit,
) {
    if (state.isLoading) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }
    state.error?.let { err ->
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            OutlinedButton(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) { Text("Thử lại") }
        }
        return
    }
    val wallet = state.wallet
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f)),
            shape = RoundedCornerShape(22.dp),
        ) {
            Column(modifier = Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Số dư ví", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
                Text(
                    "${wallet?.balance?.toLong() ?: 0}đ",
                    color = MaterialTheme.colorScheme.onSurface,
                    style = MaterialTheme.typography.headlineMedium,
                )
            }
        }
        val transactions = wallet?.transactions?.data.orEmpty()
        if (transactions.isNotEmpty()) {
            Text("Giao dịch gần đây", style = MaterialTheme.typography.titleMedium)
            transactions.take(5).forEach { tx -> TransactionRow(tx) }
        }
        Button(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("Nâng cấp gói") }
    }
}

@Composable
private fun TeacherSection() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Giảng dạy", style = MaterialTheme.typography.titleMedium)
        Text(
            "Lối vào nhanh cho nội dung teacher sẽ được mở khi role Teacher được cấp.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("Quản lý nội dung") }
    }
}

@Composable
private fun TransactionRow(tx: Transaction) {
    val isPositive = tx.direction == "ADD"
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(tx.typeLabel ?: tx.description ?: "Giao dịch", style = MaterialTheme.typography.titleSmall)
                Text(tx.createdAt ?: "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            val sign = if (isPositive) "+" else "-"
            Text(
                "$sign${tx.amount.toLong()}đ",
                color = if (isPositive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun SettingsSection(onLogout: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Bảo mật", style = MaterialTheme.typography.titleMedium)
        OutlinedButton(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("Đổi mật khẩu") }
        OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth()) { Text("Đăng xuất") }
        Text(
            "Token được lưu bằng secure storage theo từng nền tảng.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
