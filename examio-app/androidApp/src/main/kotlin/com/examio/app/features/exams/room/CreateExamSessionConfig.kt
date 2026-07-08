package com.examio.app.features.exams.room

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import com.examio.app.features.exams.models.AvailableLabel
import com.examio.app.features.exams.models.SearchUser

enum class AccessMode(val label: String) { PUBLIC("Công khai"), CODE("Mã số"), WHITELIST("Whitelist") }

/** Access control: public / 6-digit code / whitelist of users. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AccessSection(
    mode: AccessMode,
    onModeChange: (AccessMode) -> Unit,
    code: String,
    onCodeChange: (String) -> Unit,
    onGenerateCode: () -> Unit,
    whitelist: List<SearchUser>,
    query: String,
    onQueryChange: (String) -> Unit,
    searchResults: List<SearchUser>,
    isSearching: Boolean,
    onAddUser: (SearchUser) -> Unit,
    onRemoveUser: (SearchUser) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Quyền truy cập", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AccessMode.entries.forEach { m ->
                FilterChip(selected = mode == m, onClick = { onModeChange(m) }, label = { Text(m.label) })
            }
        }
        when (mode) {
            AccessMode.PUBLIC -> Unit
            AccessMode.CODE -> Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = code,
                    onValueChange = { onCodeChange(it.filter { c -> c.isDigit() }.take(6)) },
                    label = { Text("Mã truy cập (6 số)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                Button(
                    onClick = onGenerateCode,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondaryContainer, contentColor = MaterialTheme.colorScheme.onSecondaryContainer),
                ) { Text("Tạo mã") }
            }
            AccessMode.WHITELIST -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    label = { Text("Tìm người dùng (email/tên)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (isSearching) CircularProgressIndicator(modifier = Modifier.padding(4.dp))
                searchResults.filter { r -> whitelist.none { it.id == r.id } }.take(5).forEach { user ->
                    Text(
                        user.email ?: user.name ?: user.id,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.fillMaxWidth().clickable { onAddUser(user) }.padding(vertical = 6.dp),
                    )
                }
                if (whitelist.isNotEmpty()) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        whitelist.forEach { user ->
                            InputChip(selected = true, onClick = { onRemoveUser(user) }, label = { Text(user.email ?: user.name ?: user.id) })
                        }
                    }
                }
            }
        }
    }
}

/** Question selection: all / random total / random by label. */
@Composable
fun QuestionConfigSection(
    mode: Int,
    onModeChange: (Int) -> Unit,
    totalQuestions: Int,
    questionCount: String,
    onQuestionCountChange: (String) -> Unit,
    labels: List<AvailableLabel>,
    unlabeledCount: Int,
    labelCounts: Map<String, Int>,
    onLabelCountChange: (String, Int) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Cấu hình câu hỏi (tổng $totalQuestions)", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Tất cả", "Ngẫu nhiên", "Theo nhãn").forEachIndexed { i, label ->
                FilterChip(selected = mode == i, onClick = { onModeChange(i) }, label = { Text(label) })
            }
        }
        when (mode) {
            1 -> OutlinedTextField(
                value = questionCount,
                onValueChange = { onQuestionCountChange(it.filter { c -> c.isDigit() }) },
                label = { Text("Số câu (tối đa $totalQuestions)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            2 -> Column {
                labels.forEach { label ->
                    LabelCountRow(label = label, count = labelCounts[label.id] ?: 0, onCountChange = { onLabelCountChange(label.id, it) })
                }
                if (unlabeledCount > 0) {
                    LabelCountRow(
                        label = AvailableLabel(id = "unlabeled", name = "Chưa gán nhãn", questionCount = unlabeledCount),
                        count = labelCounts["unlabeled"] ?: 0,
                        onCountChange = { onLabelCountChange("unlabeled", it) },
                    )
                }
            }
        }
    }
}
