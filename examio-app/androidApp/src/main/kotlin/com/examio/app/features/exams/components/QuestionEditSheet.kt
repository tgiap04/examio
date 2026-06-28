package com.examio.app.features.exams.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.examio.app.features.exams.models.Question

private val labels = listOf("A", "B", "C", "D")

/** Add/edit a 4-option MCQ. [existing] null = adding new. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuestionEditSheet(
    existing: Question?,
    isSaving: Boolean,
    onSave: (question: String, options: List<String>, answer: String, explanation: String?) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var questionText by remember { mutableStateOf(existing?.question ?: "") }
    val opts = remember {
        val base = existing?.options ?: emptyList()
        mutableStateListOf4(base)
    }
    var correctIndex by remember {
        mutableStateOf(existing?.let { e -> e.options.indexOf(e.correctAnswer).takeIf { it >= 0 } } ?: 0)
    }
    var explanation by remember { mutableStateOf(existing?.explanation ?: "") }

    val filledOptions = opts.filter { it.isNotBlank() }
    val canSave = questionText.isNotBlank() &&
        filledOptions.size >= 2 &&
        opts.getOrNull(correctIndex)?.isNotBlank() == true

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                if (existing == null) "Thêm câu hỏi" else "Sửa câu hỏi",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            OutlinedTextField(
                value = questionText,
                onValueChange = { questionText = it },
                label = { Text("Nội dung câu hỏi") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )
            opts.forEachIndexed { i, value ->
                OutlinedTextField(
                    value = value,
                    onValueChange = { opts[i] = it },
                    label = { Text("Đáp án ${labels[i]}") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
            Text("Đáp án đúng", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                labels.forEachIndexed { i, l ->
                    FilterChip(
                        selected = correctIndex == i,
                        onClick = { correctIndex = i },
                        label = { Text(l) },
                        enabled = opts.getOrNull(i)?.isNotBlank() == true,
                    )
                }
            }
            OutlinedTextField(
                value = explanation,
                onValueChange = { explanation = it },
                label = { Text("Giải thích (tuỳ chọn)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 1,
            )
            Row(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TextButton(onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("Huỷ") }
                Button(
                    onClick = { onSave(questionText.trim(), opts.map { it.trim() }.filter { it.isNotEmpty() }, opts[correctIndex].trim(), explanation.trim().ifEmpty { null }) },
                    enabled = canSave && !isSaving,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                ) { Text("Lưu") }
            }
        }
    }
}

private fun mutableStateListOf4(base: List<String>) =
    androidx.compose.runtime.mutableStateListOf(
        base.getOrElse(0) { "" },
        base.getOrElse(1) { "" },
        base.getOrElse(2) { "" },
        base.getOrElse(3) { "" },
    )
