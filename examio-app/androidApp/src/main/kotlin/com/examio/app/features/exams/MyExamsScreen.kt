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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.BookmarkAdded
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material.icons.outlined.School
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.examio.app.design.ExamioCard
import com.examio.app.design.ExamioCardShape
import com.examio.app.features.exams.models.RecentExamAttempt
import com.examio.app.features.study.api.StudentMaterialsApiService

@Composable
fun MyExamsScreen(
    materialsApi: StudentMaterialsApiService,
    onEnterExam: (sessionId: String, title: String) -> Unit,
    onJoinSession: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm = remember { MyExamsViewModel(materialsApi) }
    val state by vm.state.collectAsState()
    var selectedAttempt by remember { mutableStateOf<RecentExamAttempt?>(null) }

    if (selectedAttempt != null) {
        ExamAttemptDetailScreen(
            attempt = selectedAttempt!!,
            onBack = { selectedAttempt = null },
            onEnterExam = onEnterExam,
            modifier = modifier,
        )
    } else {
        MyExamsListScreen(
            state = state,
            onOpen = { selectedAttempt = it },
            onTogglePin = { vm.togglePin(it.examSession.examRoom.id) },
            onRetry = { vm.load() },
            onJoinSession = onJoinSession,
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
    onJoinSession: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Spacer(Modifier.height(8.dp)) }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "Bài thi của tôi",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    "Theo dõi kết quả và tiếp tục các lượt làm bài.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        item {
            OutlinedButton(onClick = onJoinSession, modifier = Modifier.fillMaxWidth()) {
                Text("Tham gia phiên thi")
            }
        }

        if (state.isLoading) {
            item {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
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

        if (!state.isLoading && state.attempts.isEmpty() && state.error == null) {
            item {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            Icons.Outlined.School,
                            contentDescription = null,
                            modifier = Modifier.size(40.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            "Chưa có bài thi nào",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
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

        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun ExamAttemptCard(
    attempt: RecentExamAttempt,
    onOpen: () -> Unit,
    onTogglePin: () -> Unit,
) {
    val isCompleted = attempt.status == 2 || attempt.status == 3
    ExamioCard(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
        shape = ExamioCardShape,
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // Status row
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(
                            if (isCompleted)
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)
                            else
                                MaterialTheme.colorScheme.surfaceVariant,
                        )
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        if (isCompleted) Icons.Outlined.CheckCircle else Icons.Outlined.HourglassEmpty,
                        contentDescription = null,
                        modifier = Modifier.size(12.dp),
                        tint = if (isCompleted)
                            MaterialTheme.colorScheme.primary
                        else
                            MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        examStatusLabel(attempt.status),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isCompleted)
                            MaterialTheme.colorScheme.primary
                        else
                            MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onTogglePin, modifier = Modifier.size(36.dp)) {
                    Icon(
                        if (attempt.isPinned) Icons.Outlined.BookmarkAdded else Icons.Outlined.BookmarkBorder,
                        contentDescription = if (attempt.isPinned) "Bỏ ghim" else "Ghim",
                        tint = if (attempt.isPinned)
                            MaterialTheme.colorScheme.primary
                        else
                            MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }

            // Title + description
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    attempt.examSession.examRoom.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                attempt.examSession.examRoom.description?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                    )
                }
            }

            // Metadata chips row
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MetaChip("${attempt.totalQuestions} câu")
                attempt.examSession.timeLimitMinutes?.let {
                    MetaChip("$it phút")
                }
                if (attempt.correctAnswers > 0 || attempt.totalQuestions > 0) {
                    MetaChip(
                        "${attempt.correctAnswers}/${attempt.totalQuestions} đúng",
                        highlight = true,
                    )
                }
            }
        }
    }
}

@Composable
private fun MetaChip(text: String, highlight: Boolean = false) {
    Text(
        text,
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(
                if (highlight)
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)
                else
                    MaterialTheme.colorScheme.surfaceVariant,
            )
            .padding(horizontal = 8.dp, vertical = 4.dp),
        style = MaterialTheme.typography.labelSmall,
        color = if (highlight)
            MaterialTheme.colorScheme.primary
        else
            MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ExamAttemptDetailScreen(
    attempt: RecentExamAttempt,
    onBack: () -> Unit,
    onEnterExam: (sessionId: String, title: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(4.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.clickable(onClick = onBack),
        ) {
            Icon(
                Icons.AutoMirrored.Outlined.ArrowBack,
                contentDescription = "Quay lại",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(6.dp))
            Text(
                "Danh sách",
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.labelLarge,
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                attempt.examSession.examRoom.title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground,
            )
            attempt.examSession.examRoom.description?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        ExamioCard(shape = ExamioCardShape) {
            Column(modifier = Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                DetailRow(label = "Câu hỏi", value = "${attempt.totalQuestions} câu")
                attempt.examSession.timeLimitMinutes?.let {
                    DetailRow(label = "Thời lượng", value = "$it phút")
                }
                DetailRow(
                    label = "Kết quả",
                    value = "${attempt.correctAnswers}/${attempt.totalQuestions} đúng",
                    highlight = true,
                )
                attempt.score?.let {
                    DetailRow(label = "Điểm số", value = "$it điểm", highlight = true)
                }
                DetailRow(label = "Trạng thái", value = examStatusLabel(attempt.status))
            }
        }

        Button(
            onClick = { onEnterExam(attempt.examSessionId, attempt.examSession.examRoom.title) },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ),
        ) {
            Icon(Icons.Outlined.School, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Vào phòng thi")
        }

        TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text("Về danh sách")
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String, highlight: Boolean = false) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            color = if (highlight) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
        )
    }
}
