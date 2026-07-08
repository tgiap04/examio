package com.examio.app.features.exams.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CheckCircle
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
import com.examio.app.features.exams.answerLetter
import com.examio.app.features.exams.models.ReviewQuestion
import com.examio.app.features.exams.resolveAnswerIndex

/** One reviewed question: correct option green, the user's wrong pick red. */
@Composable
fun ReviewQuestionItem(number: Int, item: ReviewQuestion) {
    // Answers are letter-based system-wide ("A"/"B"/...); the stored `answer` may be a
    // letter, index, or option text, so normalize it to an index before comparing.
    val correctIndex = resolveAnswerIndex(item.answer, item.options)
    ExamioCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                "Câu $number. ${item.question}",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            item.options.forEachIndexed { i, opt ->
                val letter = answerLetter(i)
                ReviewOption(
                    label = letter,
                    text = opt,
                    isCorrect = i == correctIndex,
                    isWrongPick = item.userAnswer == letter && i != correctIndex,
                )
            }
        }
    }
}

@Composable
private fun ReviewOption(label: String, text: String, isCorrect: Boolean, isWrongPick: Boolean) {
    val primary = MaterialTheme.colorScheme.primary
    val error = MaterialTheme.colorScheme.error
    val bg = when {
        isCorrect -> primary.copy(alpha = 0.12f)
        isWrongPick -> error.copy(alpha = 0.10f)
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            "$label.",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
        when {
            isCorrect -> Icon(Icons.Outlined.CheckCircle, contentDescription = "Đúng", tint = primary, modifier = Modifier.size(18.dp))
            isWrongPick -> Icon(Icons.Outlined.Cancel, contentDescription = "Sai", tint = error, modifier = Modifier.size(18.dp))
        }
    }
}
