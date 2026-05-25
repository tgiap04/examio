package com.examio.app.features.ai

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
fun AiScreen(modifier: Modifier = Modifier) {
    var state by remember { mutableStateOf(AiUiState()) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("AI", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.onBackground)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AiSection.entries.forEach { section ->
                FilterChip(
                    selected = state.selectedSection == section,
                    onClick = { state = state.copy(selectedSection = section) },
                    label = { Text(section.label) },
                )
            }
        }
        when (state.selectedSection) {
            AiSection.Teacher -> AIChatScreen(
                state = state,
                onInputChange = { state = state.copy(input = it) },
                onSend = {
                    val text = state.input.trim()
                    if (text.isNotEmpty()) {
                        state = state.copy(
                            input = "",
                            messages = state.messages + AiChatMessage(text, true) + AiChatMessage("Mình đã ghi nhận. Khi nối SSE, phản hồi sẽ stream từng đoạn tại đây.", false),
                        )
                    }
                },
            )
            AiSection.Tool -> AIToolScreen(state)
            AiSection.History -> AIHistoryScreen(state)
        }
    }
}

@Composable
private fun AIChatScreen(
    state: AiUiState,
    onInputChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.messages) { message -> ChatMessageBubble(message) }
        }
        OutlinedTextField(
            value = state.input,
            onValueChange = onInputChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Nhập câu hỏi cho giáo viên AI") },
        )
        Button(onClick = onSend, modifier = Modifier.fillMaxWidth()) { Text("Gửi") }
    }
}

@Composable
private fun ChatMessageBubble(message: AiChatMessage) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.isUser) Arrangement.End else Arrangement.Start,
    ) {
        Text(
            message.text,
            modifier = Modifier
                .fillMaxWidth(0.82f)
                .clip(RoundedCornerShape(18.dp))
                .background(if (message.isUser) MaterialTheme.colorScheme.primary.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surface)
                .padding(14.dp),
            color = MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
private fun AIToolScreen(state: AiUiState) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Tạo học liệu từ PDF", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(20.dp)) {
            Column(modifier = Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Loại tạo: ${state.generatorType}")
                Text("Số lượng gợi ý: ${state.generatedCount}")
                Text("Tải PDF qua document picker khi nối native file picker.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = {}) { Text("Chọn PDF") }
                    Button(onClick = {}) { Text("Tạo") }
                }
            }
        }
    }
}

@Composable
private fun AIHistoryScreen(state: AiUiState) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Lịch sử", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
        state.history.forEach { item ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
                Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(item.title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        Text(item.status, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
                    }
                    Text(item.detail, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}
