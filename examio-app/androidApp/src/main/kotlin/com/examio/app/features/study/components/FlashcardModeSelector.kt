package com.examio.app.features.study.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import com.examio.app.features.study.StudyMode

private fun StudyMode.label(): String = when (this) {
    StudyMode.Sequential -> "Tuần tự"
    StudyMode.Shuffle -> "Ngẫu nhiên"
    StudyMode.ReviewUnmastered -> "Ôn sai"
}

/** Chip row that switches the active study mode. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FlashcardModeSelector(
    current: StudyMode,
    onSelect: (StudyMode) -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        StudyMode.entries.forEach { mode ->
            FilterChip(
                selected = current == mode,
                onClick = { onSelect(mode) },
                label = { Text(mode.label()) },
            )
        }
    }
}
