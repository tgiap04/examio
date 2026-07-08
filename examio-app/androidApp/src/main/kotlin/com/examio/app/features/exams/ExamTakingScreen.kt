package com.examio.app.features.exams

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.BookmarkAdded
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.examio.app.design.ExamioCard
import com.examio.app.features.exams.components.ExamTimerChip
import com.examio.app.features.exams.components.QuestionGridDialog
import com.examio.app.features.exams.components.QuestionOptionRow
import com.examio.app.features.exams.models.SecureSubmitResponse
import com.examio.app.features.exams.repository.ExamRepository

@Composable
fun ExamTakingScreen(
    examSessionId: String,
    repository: ExamRepository,
    onExit: () -> Unit,
    onSubmitted: (SecureSubmitResponse) -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm = remember(examSessionId) { ExamTakingViewModel(examSessionId, repository) }
    val state by vm.state.collectAsState()
    var showGrid by remember { mutableStateOf(false) }

    LaunchedEffect(state.result) { state.result?.let(onSubmitted) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 20.dp),
    ) {
        Spacer(Modifier.height(8.dp))
        // Top bar: exit · timer · grid
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            IconButton(onClick = onExit) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Thoát", tint = MaterialTheme.colorScheme.onSurface)
            }
            Spacer(Modifier.weight(1f))
            state.remainingSeconds?.let { ExamTimerChip(it) }
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { showGrid = true }, enabled = state.questions.isNotEmpty()) {
                Icon(Icons.Outlined.GridView, contentDescription = "Danh sách câu", tint = MaterialTheme.colorScheme.primary)
            }
        }

        when {
            state.isLoading -> CenterBox { CircularProgressIndicator(color = MaterialTheme.colorScheme.primary) }
            state.error != null -> CenterBox {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(state.error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                    TextButton(onClick = { vm.load() }) { Text("Thử lại") }
                }
            }
            state.questions.isEmpty() -> CenterBox { Text("Không có câu hỏi", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            else -> ExamBody(state = state, vm = vm)
        }
    }

    if (showGrid && state.questions.isNotEmpty()) {
        QuestionGridDialog(
            total = state.questions.size,
            currentIndex = state.currentIndex,
            answeredIndices = state.questions.indices.filter { "q_${state.questions[it].index}" in state.answers }.toSet(),
            markedIndices = state.markedIndices,
            onSelect = { vm.navigate(it); showGrid = false },
            onDismiss = { showGrid = false },
        )
    }
}

@Composable
private fun ColumnScope.ExamBody(state: ExamTakingState, vm: ExamTakingViewModel) {
    val question = state.questions[state.currentIndex]
    val selected = state.answers["q_${question.index}"]
    val isLast = state.currentIndex == state.questions.lastIndex

    Spacer(Modifier.height(12.dp))
    LinearProgressIndicator(
        progress = { (state.currentIndex + 1f) / state.questions.size },
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.primary,
        trackColor = MaterialTheme.colorScheme.surfaceVariant,
    )
    Spacer(Modifier.height(6.dp))
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            "Câu ${state.currentIndex + 1} / ${state.questions.size}",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.weight(1f))
        IconButton(onClick = { vm.toggleMark(state.currentIndex) }) {
            val marked = state.currentIndex in state.markedIndices
            Icon(
                if (marked) Icons.Outlined.BookmarkAdded else Icons.Outlined.BookmarkBorder,
                contentDescription = "Đánh dấu",
                tint = if (marked) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxWidth().weight(1f),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            ExamioCard(modifier = Modifier.fillMaxWidth()) {
                Text(
                    question.question,
                    modifier = Modifier.padding(16.dp),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
        itemsIndexed(question.options) { i, opt ->
            val letter = answerLetter(i)
            QuestionOptionRow(
                label = letter,
                text = opt,
                selected = selected == letter,
                onClick = { vm.selectAnswer(question.index, letter) },
            )
        }
    }

    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        OutlinedButton(
            onClick = { vm.previous() },
            enabled = state.currentIndex > 0,
            modifier = Modifier.weight(1f),
        ) { Text("← Trước") }

        if (isLast) {
            Button(
                onClick = { vm.submit() },
                enabled = !state.isSubmitting,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            ) {
                if (state.isSubmitting) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Nộp bài")
                }
            }
        } else {
            Button(
                onClick = { vm.next() },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            ) { Text("Tiếp →") }
        }
    }
}

@Composable
private fun CenterBox(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) { content() }
}
