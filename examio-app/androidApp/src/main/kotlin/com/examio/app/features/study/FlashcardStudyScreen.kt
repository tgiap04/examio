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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.examio.app.features.study.components.FlashcardCodeDialog
import com.examio.app.features.study.components.FlashcardCompletionCard
import com.examio.app.features.study.components.FlashcardDeniedView
import com.examio.app.features.study.components.FlashcardFaceCard
import com.examio.app.features.study.components.FlashcardModeSelector

@OptIn(ExperimentalAnimationApi::class)
@Composable
fun FlashcardSetDetailScreen(
    vm: FlashcardSetDetailViewModel,
    onBack: () -> Unit,
    onManage: (title: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsState()
    val active = state.activeCards
    val progress = if (active.isEmpty()) 0f else (state.studyIndex + 1).toFloat() / active.size

    if (state.isDenied) {
        FlashcardDeniedView(onBack = onBack, modifier = modifier)
        return
    }
    if (state.requiresCode) {
        FlashcardCodeDialog(
            isSubmitting = state.isSubmittingCode,
            codeError = state.codeError,
            onSubmit = { vm.submitCode(it) },
            onDismiss = onBack,
        )
        return
    }
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(4.dp))
        // Back row with icon + manage action
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
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
                Text("Tài liệu", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
            }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { onManage(state.set?.title.orEmpty()) }) {
                Icon(Icons.Outlined.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Quản lý thẻ", style = MaterialTheme.typography.labelLarge)
            }
        }

        if (state.isLoading) {
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }
            return@Column
        }

        state.error?.let { err ->
            Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = { vm.load() }) { Text("Thử lại") }
            return@Column
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                state.set?.title.orEmpty(),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground,
            )
            FlashcardModeSelector(current = state.mode, onSelect = { vm.setMode(it) })
            if (!state.isComplete && active.isNotEmpty()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        "${state.studyIndex + 1} / ${active.size}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier.weight(1f).height(4.dp).clip(RoundedCornerShape(2.dp)),
                        color = MaterialTheme.colorScheme.primary,
                        trackColor = MaterialTheme.colorScheme.outline,
                    )
                }
            }
        }

        val card = active.getOrNull(state.studyIndex)
        when {
            state.isComplete -> {
                FlashcardCompletionCard(
                    masteredCount = state.masteredCardIds.size,
                    totalCount = state.cards.size,
                    unmasteredCount = state.cards.count { it.id !in state.masteredCardIds },
                    onRestart = { vm.setMode(StudyMode.Sequential); vm.restart() },
                    onReviewUnmastered = { vm.setMode(StudyMode.ReviewUnmastered) },
                    modifier = Modifier.weight(1f),
                )
            }
            card == null -> {
                Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    Text("Chưa có thẻ nào trong bộ này.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            else -> {
                AnimatedContent(targetState = state.isAnswerVisible, label = "flashcard") { showAnswer ->
                    FlashcardFaceCard(
                        text = if (showAnswer) card.answer else card.question,
                        eyebrow = if (showAnswer) "Câu trả lời" else "Câu hỏi",
                        isAnswer = showAnswer,
                        onFlip = { vm.flipCard() },
                        modifier = Modifier.weight(1f),
                    )
                }
                if (state.isAnswerVisible) {
                    OutlinedButton(
                        onClick = { vm.markMastered(card.id) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Outlined.CheckCircle, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(6.dp))
                        Text("Đã thuộc")
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(
                        onClick = { vm.previousCard() },
                        enabled = state.studyIndex > 0,
                        modifier = Modifier.weight(1f),
                    ) { Text("← Trước") }
                    Button(
                        onClick = { vm.nextCard() },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary,
                            contentColor = MaterialTheme.colorScheme.onPrimary,
                        ),
                    ) { Text(if (state.studyIndex == active.lastIndex) "Hoàn thành" else "Tiếp →") }
                }
            }
        }
        Spacer(Modifier.height(4.dp))
    }
}
