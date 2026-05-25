package com.examio.app.features.exams

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
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
fun MyExamsScreen(modifier: Modifier = Modifier) {
    var state by remember { mutableStateOf(MyExamsUiState()) }

    when {
        state.isResultVisible -> ExamResultScreen(state = state, onDone = { state = MyExamsUiState() }, modifier = modifier)
        state.isTakingQuiz -> ExamQuizScreen(
            state = state,
            onSelectAnswer = { option -> state = state.copy(answers = state.answers + (state.currentQuestionIndex to option)) },
            onPrevious = { state = state.copy(currentQuestionIndex = (state.currentQuestionIndex - 1).coerceAtLeast(0)) },
            onNext = { state = state.copy(currentQuestionIndex = (state.currentQuestionIndex + 1).coerceAtMost(state.questions.lastIndex)) },
            onSubmit = { state = state.copy(isTakingQuiz = false, isResultVisible = true) },
            modifier = modifier,
        )
        state.selectedAttemptId != null -> ExamSessionScreen(
            state = state,
            onBack = { state = state.copy(selectedAttemptId = null) },
            onStart = { state = state.copy(isTakingQuiz = true, currentQuestionIndex = 0, answers = emptyMap()) },
            modifier = modifier,
        )
        else -> MyExamsListScreen(
            state = state,
            onOpen = { attempt -> state = state.copy(selectedAttemptId = attempt.id) },
            onTogglePin = { attempt ->
                state = state.copy(attempts = state.attempts.map { if (it.id == attempt.id) it.copy(isPinned = !it.isPinned) else it })
            },
            modifier = modifier,
        )
    }
}

@Composable
private fun MyExamsListScreen(
    state: MyExamsUiState,
    onOpen: (ExamAttemptItem) -> Unit,
    onTogglePin: (ExamAttemptItem) -> Unit,
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
        items(state.attempts) { attempt -> ExamAttemptCard(attempt = attempt, onOpen = { onOpen(attempt) }, onTogglePin = { onTogglePin(attempt) }) }
    }
}

@Composable
private fun ExamAttemptCard(
    attempt: ExamAttemptItem,
    onOpen: () -> Unit,
    onTogglePin: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(18.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusBadge(attempt.status)
                Spacer(Modifier.weight(1f))
                Text(if (attempt.isPinned) "Đã ghim" else "Ghim", modifier = Modifier.clickable(onClick = onTogglePin), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
            }
            Text(attempt.title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(attempt.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("${attempt.questionCount} câu", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("${attempt.durationMinutes} phút", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Điểm ${attempt.score}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun StatusBadge(status: ExamStatus) {
    Text(
        status.label,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.14f))
            .padding(horizontal = 10.dp, vertical = 5.dp),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.primary,
    )
}

@Composable
private fun ExamSessionScreen(
    state: MyExamsUiState,
    onBack: () -> Unit,
    onStart: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val attempt = state.selectedAttempt ?: return

    Column(
        modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("← Danh sách", modifier = Modifier.clickable(onClick = onBack), color = MaterialTheme.colorScheme.primary)
        Text(attempt.title, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onBackground)
        Text(attempt.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(18.dp)) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${attempt.questionCount} câu hỏi")
                Text("Thời lượng ${attempt.durationMinutes} phút")
                Text("Trạng thái: ${attempt.status.label}")
            }
        }
        Button(onClick = onStart, modifier = Modifier.fillMaxWidth()) { Text("Bắt đầu làm bài") }
    }
}

@Composable
private fun ExamQuizScreen(
    state: MyExamsUiState,
    onSelectAnswer: (Int) -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val selectedOption = state.answers[state.currentQuestionIndex]
    val currentQuestion = state.currentQuestion
    val progress = if (state.questions.isEmpty()) 0f else (state.currentQuestionIndex + 1).toFloat() / state.questions.size.toFloat()
    val allQuestionsAnswered = state.answers.keys.containsAll(state.questions.indices.toSet())

    Column(
        modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Còn 44:12", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
        LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
        if (currentQuestion == null) {
            Text("Chưa có câu hỏi nào trong bài thi.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }
        Text("Câu ${state.currentQuestionIndex + 1}", style = MaterialTheme.typography.titleMedium)
        QuestionCard(question = currentQuestion, selectedOption = selectedOption, onSelectAnswer = onSelectAnswer)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = onPrevious, enabled = state.currentQuestionIndex > 0, modifier = Modifier.weight(1f)) { Text("Trước") }
            Button(onClick = onNext, enabled = state.currentQuestionIndex < state.questions.lastIndex, modifier = Modifier.weight(1f)) { Text("Tiếp") }
        }
        Button(onClick = onSubmit, enabled = allQuestionsAnswered, modifier = Modifier.fillMaxWidth()) { Text("Nộp bài") }
    }
}

@Composable
private fun QuestionCard(
    question: ExamQuestion,
    selectedOption: Int?,
    onSelectAnswer: (Int) -> Unit,
) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(22.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(question.prompt, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            question.options.forEachIndexed { index, option ->
                Row(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { onSelectAnswer(index) }.padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = selectedOption == index, onClick = { onSelectAnswer(index) })
                    Text(option, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun ExamResultScreen(
    state: MyExamsUiState,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(80.dp))
        Text("Hoàn thành", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.onBackground)
        Text("${state.answeredCount}/${state.questions.size} câu đã trả lời", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Kết quả chi tiết sẽ hiển thị sau khi nối API chấm điểm.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text("Về danh sách") }
    }
}
