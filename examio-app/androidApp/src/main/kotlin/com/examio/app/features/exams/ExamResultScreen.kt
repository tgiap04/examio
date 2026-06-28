package com.examio.app.features.exams

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Percent
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.examio.app.design.ExamioCard
import com.examio.app.features.exams.components.ReviewQuestionItem
import com.examio.app.features.exams.models.SecureSubmitResponse
import kotlin.math.roundToInt

@Composable
fun ExamResultScreen(
    result: SecureSubmitResponse,
    examTitle: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { Spacer(Modifier.height(12.dp)) }
        item { ScoreCard(result, examTitle) }
        item { StatsRow(result) }

        val reviewQuestions = result.questions
        if (result.showAnswers && !reviewQuestions.isNullOrEmpty()) {
            item {
                Text(
                    "Xem đáp án",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onBackground,
                )
            }
            itemsIndexed(reviewQuestions) { i, q -> ReviewQuestionItem(number = i + 1, item = q) }
        }

        item {
            Button(
                onClick = onClose,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            ) { Text("Về danh sách") }
        }
        item { Spacer(Modifier.height(12.dp)) }
    }
}

@Composable
private fun ScoreCard(result: SecureSubmitResponse, examTitle: String) {
    val passed = result.passed
    ExamioCard(
        modifier = Modifier.fillMaxWidth(),
        containerColor = if (passed) MaterialTheme.colorScheme.primary.copy(alpha = 0.08f) else MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (examTitle.isNotEmpty()) {
                Text(examTitle, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                formatScore(result.score),
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
            StatusChip(passed)
            if (result.passingScore > 0) {
                Text(
                    "Điểm qua môn: ${formatScore(result.passingScore)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun StatusChip(passed: Boolean) {
    val color = if (passed) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
    Text(
        if (passed) "Đạt" else "Chưa đạt",
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(color.copy(alpha = 0.14f))
            .padding(horizontal = 14.dp, vertical = 6.dp),
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = color,
    )
}

@Composable
private fun StatsRow(result: SecureSubmitResponse) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconStatCard(Icons.Outlined.CheckCircle, "${result.correctAnswers}/${result.totalQuestions}", "Câu đúng", Modifier.weight(1f))
        IconStatCard(Icons.Outlined.Percent, "${result.percentage.roundToInt()}%", "Tỉ lệ", Modifier.weight(1f))
        IconStatCard(Icons.Outlined.TaskAlt, "${result.totalQuestions}", "Tổng câu", Modifier.weight(1f))
    }
}

@Composable
private fun IconStatCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    value: String,
    label: String,
    modifier: Modifier = Modifier,
) {
    ExamioCard(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun formatScore(score: Double): String =
    if (score == score.toLong().toDouble()) score.toLong().toString() else ((score * 100).roundToInt() / 100.0).toString()
