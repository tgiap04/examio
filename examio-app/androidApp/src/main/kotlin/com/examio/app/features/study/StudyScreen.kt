package com.examio.app.features.study

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ExperimentalAnimationApi
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun StudyScreen(modifier: Modifier = Modifier) {
    var state by remember { mutableStateOf(StudyUiState()) }

    if (state.selectedMaterialId == null) {
        MyMaterialsScreen(
            state = state,
            onOpenMaterial = { material -> state = state.copy(selectedMaterialId = material.id, currentCardIndex = 0, isAnswerVisible = false) },
            onTogglePin = { material ->
                state = state.copy(
                    materials = state.materials.map { if (it.id == material.id) it.copy(isPinned = !it.isPinned) else it },
                )
            },
            modifier = modifier,
        )
    } else {
        FlashcardStudyScreen(
            state = state,
            onBack = { state = state.copy(selectedMaterialId = null, isAnswerVisible = false) },
            onFlip = { state = state.copy(isAnswerVisible = !state.isAnswerVisible) },
            onNext = {
                val next = (state.currentCardIndex + 1).coerceAtMost(state.flashcards.lastIndex)
                state = state.copy(currentCardIndex = next, isAnswerVisible = false)
            },
            onPrevious = {
                val previous = (state.currentCardIndex - 1).coerceAtLeast(0)
                state = state.copy(currentCardIndex = previous, isAnswerVisible = false)
            },
            modifier = modifier,
        )
    }
}

@Composable
private fun MyMaterialsScreen(
    state: StudyUiState,
    onOpenMaterial: (StudyMaterial) -> Unit,
    onTogglePin: (StudyMaterial) -> Unit,
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
                Text("Học tập", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.onBackground)
                Text(
                    "Tiếp tục bộ flashcard gần đây và giữ nhịp ôn luyện mỗi ngày.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(state.materials) { material ->
            FlashcardSetItem(
                material = material,
                onOpen = { onOpenMaterial(material) },
                onTogglePin = { onTogglePin(material) },
            )
        }
    }
}

@Composable
private fun FlashcardSetItem(
    material: StudyMaterial,
    onOpen: () -> Unit,
    onTogglePin: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(18.dp),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                modifier = Modifier
                    .height(56.dp)
                    .width(56.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.16f)),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(material.cardCount.toString(), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                Text("thẻ", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(material.title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Text(material.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(material.lastViewed, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                text = if (material.isPinned) "Đã ghim" else "Ghim",
                modifier = Modifier.clickable(onClick = onTogglePin).padding(8.dp),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@OptIn(ExperimentalAnimationApi::class)
@Composable
private fun FlashcardStudyScreen(
    state: StudyUiState,
    onBack: () -> Unit,
    onFlip: () -> Unit,
    onNext: () -> Unit,
    onPrevious: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val progress = if (state.flashcards.isEmpty()) 0f else (state.currentCardIndex + 1).toFloat() / state.flashcards.size.toFloat()
    val currentCard = state.currentCard

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("← Tài liệu", modifier = Modifier.clickable(onClick = onBack), color = MaterialTheme.colorScheme.primary)
        Text(state.selectedMaterial?.title.orEmpty(), style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onBackground)
        LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
        if (currentCard == null) {
            Text("Chưa có thẻ nào trong bộ này.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }
        AnimatedContent(targetState = state.isAnswerVisible, label = "flashcard") { isAnswerVisible ->
            FlashcardCard(
                text = if (isAnswerVisible) currentCard.answer else currentCard.question,
                eyebrow = if (isAnswerVisible) "Câu trả lời" else "Câu hỏi",
                onFlip = onFlip,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = onPrevious, enabled = state.currentCardIndex > 0, modifier = Modifier.weight(1f)) { Text("Trước") }
            Button(onClick = onNext, enabled = state.currentCardIndex < state.flashcards.lastIndex, modifier = Modifier.weight(1f)) { Text("Tiếp") }
        }
        Text(
            "${state.currentCardIndex + 1}/${state.flashcards.size} · Chạm thẻ để lật",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun FlashcardCard(
    text: String,
    eyebrow: String,
    onFlip: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(260.dp)
            .clickable(onClick = onFlip),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(24.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(22.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(eyebrow, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(12.dp))
            Text(text, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}
