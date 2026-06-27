package com.examio.app.features.history

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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.examio.app.features.history.models.ExamHistoryItem
import com.examio.app.features.history.models.HistoryStats
import com.examio.app.features.history.models.PDFHistoryItem
import com.examio.app.features.history.repository.HistoryRepository

@Composable
fun LichSuScreen(
    historyRepository: HistoryRepository,
    modifier: Modifier = Modifier,
) {
    val vm = remember { HistoryViewModel(historyRepository) }
    val state by vm.state.collectAsState()

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Lịch sử", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.onBackground)
                Text("Theo dõi hoạt động học tập, tài liệu và kết quả gần đây.", color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                    TextButton(onClick = vm::load) { Text("Thử lại") }
                }
            }
        }

        state.stats?.let { stats ->
            item { StatsGrid(stats) }
        }

        if (state.pdfs.isNotEmpty()) {
            item { Text("Tài liệu PDF", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground) }
            items(state.pdfs) { pdf -> PdfCard(pdf) }
        }

        if (state.exams.isNotEmpty()) {
            item { Text("Bài thi gần đây", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground) }
            items(state.exams) { exam -> ExamCard(exam) }
        }
    }
}

@Composable
private fun StatsGrid(stats: HistoryStats) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            StatCard("${stats.totalPDFs}", "PDF", Modifier.weight(1f))
            StatCard("${stats.examsCreated}", "Bài thi", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            StatCard("${stats.flashcardSets}", "Flashcard", Modifier.weight(1f))
            StatCard("${stats.totalStudyHours}h", "Tự học", Modifier.weight(1f))
        }
    }
}

@Composable
private fun StatCard(value: String, label: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(value, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PdfCard(pdf: PDFHistoryItem) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(pdf.filename, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface)
                Text(pdf.processingStatus, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall)
            }
            val detail = buildString {
                pdf.quizHistory?.let { append("${it.quizCount} quiz") }
                pdf.flashcardHistory?.let {
                    if (isNotEmpty()) append(" · ")
                    append("${it.flashcardCount} flashcard")
                }
            }
            if (detail.isNotEmpty()) {
                Text(detail, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun ExamCard(exam: ExamHistoryItem) {
    val title = exam.examSession?.examRoom?.title ?: "Bài thi"
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("${exam.correctAnswers}/${exam.totalQuestions} đúng", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                exam.score?.let { Text("${it} điểm", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
    }
}
