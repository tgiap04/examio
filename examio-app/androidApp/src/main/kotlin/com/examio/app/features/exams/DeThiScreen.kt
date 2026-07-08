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
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Quiz
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import com.examio.app.features.exams.models.QuizSet
import com.examio.app.features.exams.repository.ExamRepository
import com.examio.app.features.exams.room.ExamRoomsScreen

@Composable
fun DeThiScreen(
    examRepository: ExamRepository,
    onGenerateWithAi: () -> Unit = {},
    onTakeSession: (sessionId: String, title: String) -> Unit = { _, _ -> },
    modifier: Modifier = Modifier,
) {
    val vm = remember { DeThiViewModel(examRepository) }
    val state by vm.state.collectAsState()
    var managing by remember { mutableStateOf<QuizSet?>(null) }
    var showRooms by remember { mutableStateOf(false) }

    managing?.let { set ->
        QuizSetManageScreen(
            setId = set.id,
            setTitle = set.title,
            repository = examRepository,
            onBack = { managing = null; vm.load() },
            modifier = modifier,
        )
        return
    }

    if (showRooms) {
        ExamRoomsScreen(
            examRepository = examRepository,
            onBack = { showRooms = false },
            onTakeSession = onTakeSession,
            modifier = modifier,
        )
        return
    }

    Box(modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(8.dp)) }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Đề thi", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)
                    Text("Quản lý bộ đề, câu hỏi và phòng thi của bạn.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    StatCard("${state.quizSets.size}", "Bộ đề", Icons.Outlined.Description, Modifier.weight(1f))
                    StatCard("${state.totalQuestions}", "Câu hỏi", Icons.Outlined.Quiz, Modifier.weight(1f))
                }
            }
            item {
                OutlinedButton(onClick = onGenerateWithAi, modifier = Modifier.fillMaxWidth()) {
                    Text("Tạo đề bằng AI")
                }
            }
            item {
                OutlinedButton(onClick = { showRooms = true }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Outlined.MeetingRoom, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Quản lý phòng thi")
                }
            }
            item {
                Text("Bộ đề của tôi", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            if (state.isLoading) {
                item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = MaterialTheme.colorScheme.primary) } }
            }
            state.error?.let { err ->
                item {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = { vm.load() }) { Text("Thử lại") }
                    }
                }
            }
            if (!state.isLoading && state.quizSets.isEmpty() && state.error == null) {
                item {
                    Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) {
                        Text("Chưa có bộ đề nào", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            items(state.quizSets, key = { it.id }) { set ->
                QuizSetCard(set = set, onClick = { managing = set })
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun StatCard(
    value: String,
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier,
) {
    ExamioCard(modifier = modifier, shape = ExamioCardShape) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary) }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun QuizSetCard(set: QuizSet, onClick: () -> Unit) {
    ExamioCard(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick), shape = ExamioCardShape) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Outlined.Description, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(set.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    "${set.questionCount} câu hỏi" + (set.description?.let { " • $it" } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }
    }
}
