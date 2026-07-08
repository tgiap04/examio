package com.examio.app.features.exams.room

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.examio.app.features.exams.repository.ExamRepository

private const val MAX_TITLE = 200
private const val MAX_DESC = 1000

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateExamRoomScreen(
    examRepository: ExamRepository,
    onBack: () -> Unit,
    onCreated: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm = remember { CreateExamRoomViewModel(examRepository) }
    val state by vm.state.collectAsState()

    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var quizSetId by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }
    var titleError by remember { mutableStateOf<String?>(null) }
    var quizSetError by remember { mutableStateOf<String?>(null) }

    val selectedQuizSet = state.quizSets.firstOrNull { it.id == quizSetId }

    fun validateAndSubmit() {
        titleError = when {
            title.isBlank() -> "Tiêu đề không được để trống"
            title.length > MAX_TITLE -> "Tiêu đề tối đa $MAX_TITLE ký tự"
            else -> null
        }
        quizSetError = if (quizSetId.isBlank()) "Vui lòng chọn bộ đề thi" else null
        if (description.length > MAX_DESC) return
        if (titleError == null && quizSetError == null) {
            vm.submit(title, description, quizSetId, onCreated)
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(8.dp))
        BackRow(label = "Phòng thi", onBack = onBack)
        Text("Tạo phòng thi", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)

        OutlinedTextField(
            value = title,
            onValueChange = { title = it; titleError = null },
            label = { Text("Tiêu đề *") },
            isError = titleError != null,
            supportingText = titleError?.let { { Text(it) } } ?: { Text("${title.length}/$MAX_TITLE") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = description,
            onValueChange = { if (it.length <= MAX_DESC) description = it },
            label = { Text("Mô tả (tuỳ chọn)") },
            supportingText = { Text("${description.length}/$MAX_DESC") },
            minLines = 3,
            modifier = Modifier.fillMaxWidth(),
        )

        ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
            OutlinedTextField(
                value = selectedQuizSet?.let { "${it.title} (${it.questionCount} câu hỏi)" } ?: "",
                onValueChange = {},
                readOnly = true,
                label = { Text("Bộ đề thi *") },
                isError = quizSetError != null,
                placeholder = { Text(if (state.isLoadingQuizSets) "Đang tải..." else "Chọn bộ đề") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                supportingText = quizSetError?.let { { Text(it) } },
                modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
            )
            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                if (state.quizSets.isEmpty()) {
                    DropdownMenuItem(text = { Text("Không có bộ đề nào") }, onClick = {}, enabled = false)
                }
                state.quizSets.forEach { set ->
                    DropdownMenuItem(
                        text = { Text("${set.title} (${set.questionCount} câu hỏi)") },
                        onClick = { quizSetId = set.id; quizSetError = null; expanded = false },
                    )
                }
            }
        }

        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

        Button(
            onClick = { validateAndSubmit() },
            enabled = !state.isSubmitting,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary),
        ) {
            if (state.isSubmitting) {
                CircularProgressIndicator(modifier = Modifier.height(18.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
            } else {
                Text("Tạo phòng thi")
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}
