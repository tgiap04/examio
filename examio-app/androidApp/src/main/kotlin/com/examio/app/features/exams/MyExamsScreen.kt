package com.examio.app.features.exams

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material3.CircularProgressIndicator
import com.examio.app.design.ExamioCard
import com.examio.app.design.ExamioCardShape
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.unit.dp
import com.examio.app.features.exams.models.RecentExamAttempt
import com.examio.app.features.study.api.StudentMaterialsApiService

@Composable
fun MyExamsScreen(
    materialsApi: StudentMaterialsApiService,
    modifier: Modifier = Modifier,
) {
    val vm = remember { MyExamsViewModel(materialsApi) }
    val state by vm.state.collectAsState()
    var selectedAttempt by remember { mutableStateOf<RecentExamAttempt?>(null) }

    if (selectedAttempt != null) {
        ExamAttemptDetailScreen(
            attempt = selectedAttempt!!,
            onBack = { selectedAttempt = null },
            modifier = modifier,
        )
    } else {
        MyExamsListScreen(
            state = state,
            onOpen = { selectedAttempt = it },
            onTogglePin = { vm.togglePin(it.examSession.examRoom.id) },
            onRetry = { vm.load() },
            modifier = modifier,
        )
    }
}

@Composable
private fun MyExamsListScreen(
    state: MyExamsState,
    onOpen: (RecentExamAttempt) -> Unit,
    onTogglePin: (RecentExamAttempt) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Thi của tôi", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.onBackground)
                Text("Quản lý phòng thi, tiếp tục lượt làm bài và xem kết quả gần đây.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        if (state.isLoading) {
            item {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        }

        state.error?.let { err ->
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = onRetry) { Text("Thử lại") }
                }
            }
        }

        items(state.attempts) { attempt ->
            ExamAttemptCard(
                attempt = attempt,
                onOpen = { onOpen(attempt) },
                onTogglePin = { onTogglePin(attempt) },
            )
        }
    }
}

@Composable
private fun ExamAttemptCard(
    attempt: RecentExamAttempt,
    onOpen: () -> Unit,
    onTogglePin: () -> Unit,
) {
    ExamioCard(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
        shape = ExamioCardShape,
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    examStatusLabel(attempt.status),
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.14f))
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.weight(1f))
                Text(
                    if (attempt.isPinned) "Đã ghim" else "Ghim",
                    modifier = Modifier.clickable(onClick = onTogglePin),
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            Text(attempt.examSession.examRoom.title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            attempt.examSession.examRoom.description?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("${attempt.totalQuestions} câu", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                attempt.examSession.timeLimitMinutes?.let {
                    Text("$it phút", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text("${attempt.correctAnswers}/${attempt.totalQuestions} đúng", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun ExamAttemptDetailScreen(
    attempt: RecentExamAttempt,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("← Danh sách", modifier = Modifier.clickable(onClick = onBack), color = MaterialTheme.colorScheme.primary)
        Text(attempt.examSession.examRoom.title, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onBackground)
        attempt.examSession.examRoom.description?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        ExamioCard(shape = ExamioCardShape) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${attempt.totalQuestions} câu hỏi")
                attempt.examSession.timeLimitMinutes?.let { Text("Thời lượng $it phút") }
                Text("Kết quả: ${attempt.correctAnswers}/${attempt.totalQuestions} đúng · ${attempt.score} điểm")
                Text("Trạng thái: ${examStatusLabel(attempt.status)}")
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "Làm lại và nộp bài trực tiếp từ web app tại examio.vn để xem chi tiết đáp án.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Về danh sách") }
    }
}
