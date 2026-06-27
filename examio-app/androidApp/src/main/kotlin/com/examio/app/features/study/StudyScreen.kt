package com.examio.app.features.study

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ExperimentalAnimationApi
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import com.examio.app.design.ExamioCard
import com.examio.app.design.ExamioCardShape
import androidx.compose.material3.LinearProgressIndicator
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
import com.examio.app.features.study.models.RecentFlashcardSet
import com.examio.app.features.study.repository.FlashcardRepository

@Composable
fun StudyScreen(
    flashcardRepository: FlashcardRepository,
    modifier: Modifier = Modifier,
) {
    val materialsVM = remember { MyMaterialsViewModel(flashcardRepository) }
    var selectedSetId by remember { mutableStateOf<String?>(null) }

    if (selectedSetId == null) {
        MyMaterialsScreen(
            vm = materialsVM,
            onOpenSet = { selectedSetId = it },
            modifier = modifier,
        )
    } else {
        val detailVM = remember(selectedSetId) {
            FlashcardSetDetailViewModel(selectedSetId!!, flashcardRepository)
        }
        FlashcardSetDetailScreen(
            vm = detailVM,
            onBack = { selectedSetId = null },
            modifier = modifier,
        )
    }
}

@Composable
private fun MyMaterialsScreen(
    vm: MyMaterialsViewModel,
    onOpenSet: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsState()

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
                    TextButton(onClick = { vm.load() }) { Text("Thử lại") }
                }
            }
        }

        items(state.sets) { set ->
            FlashcardSetItem(
                set = set,
                onOpen = { onOpenSet(set.id) },
                onTogglePin = { vm.togglePin(set.id) },
            )
        }
    }
}

@Composable
private fun FlashcardSetItem(
    set: RecentFlashcardSet,
    onOpen: () -> Unit,
    onTogglePin: () -> Unit,
) {
    ExamioCard(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
        shape = ExamioCardShape,
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
                Text(set.flashcardCount.toString(), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                Text("thẻ", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(set.title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                set.description?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                set.lastViewedAt?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            Text(
                text = if (set.isPinned) "Đã ghim" else "Ghim",
                modifier = Modifier.clickable(onClick = onTogglePin).padding(8.dp),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@OptIn(ExperimentalAnimationApi::class)
@Composable
private fun FlashcardSetDetailScreen(
    vm: FlashcardSetDetailViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsState()
    val progress = if (state.cards.isEmpty()) 0f else (state.studyIndex + 1).toFloat() / state.cards.size

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("← Tài liệu", modifier = Modifier.clickable(onClick = onBack), color = MaterialTheme.colorScheme.primary)

        if (state.isLoading) {
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }

        state.error?.let { err ->
            Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = { vm.load() }) { Text("Thử lại") }
            return@Column
        }

        Text(state.set?.title.orEmpty(), style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onBackground)
        LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())

        val card = state.cards.getOrNull(state.studyIndex)
        if (card == null) {
            Text("Chưa có thẻ nào trong bộ này.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            AnimatedContent(targetState = state.isAnswerVisible, label = "flashcard") { showAnswer ->
                FlashcardCard(
                    text = if (showAnswer) card.answer else card.question,
                    eyebrow = if (showAnswer) "Câu trả lời" else "Câu hỏi",
                    onFlip = { vm.flipCard() },
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { vm.previousCard() }, enabled = state.studyIndex > 0, modifier = Modifier.weight(1f)) { Text("Trước") }
                Button(onClick = { vm.nextCard() }, enabled = state.studyIndex < state.cards.lastIndex, modifier = Modifier.weight(1f)) { Text("Tiếp") }
            }
            Text(
                "${state.studyIndex + 1}/${state.cards.size} · Chạm thẻ để lật",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun FlashcardCard(text: String, eyebrow: String, onFlip: () -> Unit) {
    ExamioCard(
        modifier = Modifier.fillMaxWidth().height(260.dp).clickable(onClick = onFlip),
        shape = ExamioCardShape,
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
