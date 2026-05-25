package com.examio.app.features.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun HomeScreen(modifier: Modifier = Modifier) {
    val state = remember { HomeDashboardState() }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Trang chủ", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.onBackground)
            Text(
                "Theo dõi nhịp học, tài liệu gần đây và các kỳ thi cần tiếp tục.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        StatsGrid(state.stats)
        RecentSection(title = "Flashcard gần đây", emptyText = "Chưa có bộ flashcard nào.", isEmpty = state.recentFlashcards.isEmpty()) {
            state.recentFlashcards.forEach { RecentFlashcardItem(it) }
        }
        RecentSection(title = "Bài thi gần đây", emptyText = "Chưa có lượt thi nào.", isEmpty = state.recentExams.isEmpty()) {
            state.recentExams.forEach { RecentExamItem(it) }
        }
    }
}

@Composable
private fun StatsGrid(stats: List<HomeStat>) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        stats.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                row.forEach { stat -> StatsCard(stat, Modifier.weight(1f)) }
                if (row.size == 1) Column(Modifier.weight(1f)) {}
            }
        }
    }
}

@Composable
private fun RecentSection(
    title: String,
    emptyText: String,
    isEmpty: Boolean,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            content()
        }
        if (isEmpty) {
            Text(emptyText, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
