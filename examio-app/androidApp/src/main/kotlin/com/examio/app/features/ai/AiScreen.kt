package com.examio.app.features.ai

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.examio.app.features.ai.models.RecentUpload
import com.examio.app.features.ai.repository.AIChatRepository

@Composable
fun AiScreen(
    aiRepository: AIChatRepository,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val vm = remember { AIToolViewModel(aiRepository, context) }
    val state by vm.state.collectAsState()
    var selectedSection by remember { mutableStateOf(AiSection.Teacher) }

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
                    selected = selectedSection == section,
                    onClick = { selectedSection = section },
                    label = { Text(section.label) },
                )
            }
        }
        when (selectedSection) {
            AiSection.Teacher -> AIChatSection(
                state = state,
                onInputChange = vm::onInputChange,
                onSend = vm::sendMessage,
            )
            AiSection.Tool -> AIGeneratorSection(
                state = state,
                onTypeSelected = vm::onTypeSelected,
                onQuantityChange = vm::onQuantityChange,
                onKeywordChange = vm::onKeywordChange,
                onFileSelected = vm::onFileSelected,
                onGenerate = vm::generate,
            )
            AiSection.History -> AIHistorySection(
                state = state,
                onRetry = vm::loadUploads,
                onDelete = vm::deleteUpload,
            )
        }
    }
}

// ── Teacher / Chat ────────────────────────────────────────────────────────────

@Composable
private fun AIChatSection(
    state: AiScreenState,
    onInputChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.messages) { msg -> ChatMessageBubble(msg) }
        }
        state.chatError?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        OutlinedTextField(
            value = state.input,
            onValueChange = onInputChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Nhập câu hỏi cho giáo viên AI") },
            enabled = !state.isSending,
        )
        Button(
            onClick = onSend,
            modifier = Modifier.fillMaxWidth(),
            enabled = state.input.isNotBlank() && !state.isSending,
        ) {
            if (state.isSending) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp), strokeWidth = 2.dp)
            Text("Gửi")
        }
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
                .background(
                    if (message.isUser) MaterialTheme.colorScheme.primary.copy(alpha = 0.16f)
                    else MaterialTheme.colorScheme.surface,
                )
                .padding(14.dp),
            color = MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

// ── Generator ─────────────────────────────────────────────────────────────────

@Composable
private fun AIGeneratorSection(
    state: AiScreenState,
    onTypeSelected: (Int) -> Unit,
    onQuantityChange: (Int) -> Unit,
    onKeywordChange: (String) -> Unit,
    onFileSelected: (Uri) -> Unit,
    onGenerate: () -> Unit,
) {
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { onFileSelected(it) }
    }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Tạo học liệu từ PDF", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = state.typeResult == 1, onClick = { onTypeSelected(1) }, label = { Text("Quiz") })
            FilterChip(selected = state.typeResult == 2, onClick = { onTypeSelected(2) }, label = { Text("Flashcard") })
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = state.quantity.toString(),
                onValueChange = { it.toIntOrNull()?.let(onQuantityChange) },
                label = { Text("Số lượng") },
                modifier = Modifier.weight(0.8f),
            )
            OutlinedTextField(
                value = state.keyword,
                onValueChange = onKeywordChange,
                label = { Text("Từ khóa") },
                modifier = Modifier.weight(1.2f),
            )
        }

        OutlinedButton(
            onClick = { filePicker.launch("application/pdf") },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(state.selectedFileName ?: "Chọn file PDF")
        }

        state.generateError?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }

        state.jobStatus?.let { status ->
            val label = when (status.status) {
                "PENDING" -> "Đang chờ xử lý…"
                "RUNNING" -> "Đang tạo… ${status.progress?.let { "$it%" } ?: ""}"
                "DONE" -> "Tạo xong!"
                "FAILED" -> "Thất bại: ${status.error ?: "lỗi không xác định"}"
                "CANCELLED" -> "Đã huỷ"
                else -> status.status
            }
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (status.status in setOf("PENDING", "RUNNING")) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
        }

        Button(
            onClick = onGenerate,
            modifier = Modifier.fillMaxWidth(),
            enabled = state.selectedFileName != null && !state.isGenerating,
        ) {
            if (state.isGenerating) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp), strokeWidth = 2.dp)
            Text("Tạo học liệu")
        }
    }
}

// ── History ────────────────────────────────────────────────────────────────────

@Composable
private fun AIHistorySection(
    state: AiScreenState,
    onRetry: () -> Unit,
    onDelete: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Lịch sử tải lên", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)

        when {
            state.uploadsLoading -> Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.uploadsError != null -> Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Text(state.uploadsError, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = onRetry) { Text("Thử lại") }
            }
            state.uploads.isEmpty() -> Text(
                "Chưa có file nào được tải lên.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
            else -> state.uploads.forEach { upload ->
                UploadCard(upload = upload, onDelete = { onDelete(upload.id) })
            }
        }
    }
}

@Composable
private fun UploadCard(upload: RecentUpload, onDelete: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    upload.filename,
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f),
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    upload.processingStatus ?: "",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            val detail = buildString {
                upload.quizHistory?.let { append("${it.quizCount} quiz") }
                upload.flashcardHistory?.let {
                    if (isNotEmpty()) append(" · ")
                    append("${it.flashcardCount} flashcard")
                }
            }
            if (detail.isNotEmpty()) {
                Text(detail, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            }
            TextButton(onClick = onDelete) { Text("Xoá", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
        }
    }
}
