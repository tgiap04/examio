package com.examio.app.features.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun RecentFlashcardItem(item: HomeRecentFlashcard, modifier: Modifier = Modifier) {
    RecentCard(modifier) {
        Text(item.title, style = MaterialTheme.typography.titleMedium)
        Text("${item.cardCount} thẻ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun RecentExamItem(item: HomeRecentExam, modifier: Modifier = Modifier) {
    RecentCard(modifier) {
        Row {
            Text(item.title, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.weight(1f))
            Text(item.score, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleSmall)
        }
        Text(item.date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun RecentCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(12.dp))
            .padding(16.dp),
        content = content,
    )
}
