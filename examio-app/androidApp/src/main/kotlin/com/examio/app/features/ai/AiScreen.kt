package com.examio.app.features.ai

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.examio.app.design.ExamioCard
import com.examio.app.features.ai.models.JobResult
import com.examio.app.features.ai.repository.AIGeneratorRepository
import com.examio.app.features.exams.repository.ExamRepository
import com.examio.app.features.study.repository.FlashcardRepository

@Composable
fun AiScreen(
    aiRepository: AIGeneratorRepository,
    examRepository: ExamRepository,
    flashcardRepository: FlashcardRepository,
    modifier: Modifier = Modifier,
    initialTypeResult: Int? = null,
    onClose: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val vm = remember { AIToolViewModel(aiRepository, examRepository, flashcardRepository, context) }
    val state by vm.state.collectAsState()

    // When opened from a contextual entry (Study/DeThi), preset the generation type.
    LaunchedEffect(Unit) { initialTypeResult?.let(vm::onTypeSelected) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (onClose != null) {
            TextButton(onClick = onClose) { Text("‹ Quay lại") }
        }
        Text("Tạo học liệu từ PDF", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onBackground)

        // Lock the type once generation starts / a result exists — the saved domain
        // must stay tied to what was actually generated (result.type).
        val typeLocked = state.isGenerating || state.generatedResult != null
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = state.typeResult == 1, onClick = { vm.onTypeSelected(1) }, enabled = !typeLocked, label = { Text("Quiz") })
            FilterChip(selected = state.typeResult == 2, onClick = { vm.onTypeSelected(2) }, enabled = !typeLocked, label = { Text("Flashcard") })
        }

        OutlinedTextField(
            value = state.quantity.toString(),
            onValueChange = { it.toIntOrNull()?.let(vm::onQuantityChange) },
            label = { Text("Số lượng") },
            modifier = Modifier.fillMaxWidth(),
        )

        val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            uri?.let(vm::onFileSelected)
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
            val normalized = status.status.lowercase()
            val label = when (normalized) {
                "pending" -> "Đang chờ xử lý…"
                "processing" -> "Đang tạo… ${status.progress?.let { "$it%" } ?: ""}"
                "completed" -> "Tạo xong!"
                "failed" -> "Thất bại: ${status.error ?: "lỗi không xác định"}"
                "cancelled" -> "Đã huỷ"
                else -> status.status
            }
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (normalized in setOf("pending", "processing")) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
        }

        Button(
            onClick = vm::generate,
            modifier = Modifier.fillMaxWidth(),
            enabled = state.selectedFileName != null && !state.isGenerating,
        ) {
            if (state.isGenerating) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp), strokeWidth = 2.dp)
            Text("Tạo học liệu")
        }

        // Completed result: preview + save-to-set.
        state.generatedResult?.let { result ->
            GeneratedResultPreview(
                state = state,
                result = result,
                onSaveToNewSet = vm::saveToNewSet,
                onSaveToExistingSet = vm::saveToExistingSet,
            )
        }
    }
}

@Composable
private fun GeneratedResultPreview(
    state: AiScreenState,
    result: JobResult,
    onSaveToNewSet: (String) -> Unit,
    onSaveToExistingSet: (String) -> Unit,
) {
    var newSetTitle by remember { mutableStateOf("") }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        val count = result.quizzes?.size ?: result.flashcards?.size ?: 0
        Text("Kết quả ($count)", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)

        // Preview a handful so the list stays light.
        result.quizzes?.take(5)?.forEach { q ->
            ExamioCard {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(q.question, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                    q.options.forEach { opt ->
                        val correct = opt == q.answer
                        Text(
                            (if (correct) "✓ " else "• ") + opt,
                            style = MaterialTheme.typography.bodySmall,
                            color = if (correct) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
        result.flashcards?.take(5)?.forEach { c ->
            ExamioCard {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(c.question, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                    Text(c.answer, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (count > 5) {
            Text("… và ${count - 5} mục khác", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        if (state.savedCount != null) {
            Text("Đã lưu ${state.savedCount} mục vào bộ.", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium)
        } else {
            Text("Lưu vào bộ", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

            // Save into a new set.
            OutlinedTextField(
                value = newSetTitle,
                onValueChange = { newSetTitle = it },
                label = { Text("Tên bộ mới") },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isSaving,
            )
            Button(
                onClick = { onSaveToNewSet(newSetTitle) },
                modifier = Modifier.fillMaxWidth(),
                enabled = newSetTitle.isNotBlank() && !state.isSaving,
            ) {
                if (state.isSaving) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp), strokeWidth = 2.dp)
                Text("Tạo bộ mới & lưu")
            }

            // Or save into an existing set — keyed off the result's own type.
            val existing: List<Pair<String, String>> = if (result.type == "quiz") {
                state.quizSets.map { it.id to it.title }
            } else {
                state.flashcardSets.map { it.id to it.title }
            }
            if (existing.isNotEmpty()) {
                Text("Hoặc chọn bộ có sẵn:", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                existing.take(20).forEach { (id, title) ->
                    OutlinedButton(
                        onClick = { onSaveToExistingSet(id) },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !state.isSaving,
                    ) { Text(title) }
                }
            }
        }

        state.saveError?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
    }
}
