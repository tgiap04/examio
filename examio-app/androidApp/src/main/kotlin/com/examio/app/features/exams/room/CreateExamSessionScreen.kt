package com.examio.app.features.exams.room

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.examio.app.features.exams.models.CreateExamSessionRequest
import com.examio.app.features.exams.models.LabelQuestionConfig
import com.examio.app.features.exams.models.SearchUser
import com.examio.app.features.exams.repository.ExamRepository
import java.time.Instant

@Composable
fun CreateExamSessionScreen(
    examRepository: ExamRepository,
    roomId: String,
    roomTitle: String,
    onBack: () -> Unit,
    onCreated: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm = remember(roomId) { CreateExamSessionViewModel(roomId, examRepository) }
    val state by vm.state.collectAsState()

    var startMillis by remember { mutableStateOf<Long?>(System.currentTimeMillis() + 30 * 60 * 1000) }
    var endMillis by remember { mutableStateOf<Long?>(null) }
    var accessMode by remember { mutableStateOf(AccessMode.PUBLIC) }
    var code by remember { mutableStateOf("") }
    val whitelist = remember { mutableStateListOf<SearchUser>() }
    var query by remember { mutableStateOf("") }
    var questionMode by remember { mutableStateOf(0) }
    var questionCount by remember { mutableStateOf("") }
    val labelCounts = remember { mutableStateMapOf<String, Int>() }
    var shuffle by remember { mutableStateOf(false) }
    var showAnswers by remember { mutableStateOf(true) }
    var allowRetake by remember { mutableStateOf(false) }
    var maxAttempts by remember { mutableStateOf("1") }
    var passingScore by remember { mutableStateOf("40") }
    var localError by remember { mutableStateOf<String?>(null) }

    fun submit() {
        val start = startMillis ?: run { localError = "Vui lòng chọn thời gian bắt đầu"; return }
        if (endMillis != null && endMillis!! <= start) { localError = "Thời gian kết thúc phải sau thời gian bắt đầu"; return }
        if (accessMode == AccessMode.CODE && !Regex("^\\d{6}$").matches(code)) { localError = "Mã truy cập phải gồm 6 chữ số"; return }
        if (accessMode == AccessMode.WHITELIST && whitelist.isEmpty()) { localError = "Vui lòng thêm ít nhất 1 người dùng"; return }
        val attempts = if (allowRetake) (maxAttempts.toIntOrNull() ?: 1) else 1
        if (allowRetake && attempts !in 1..10) { localError = "Số lần làm phải từ 1 đến 10"; return }
        val pass = passingScore.toIntOrNull() ?: 40
        if (pass !in 0..100) { localError = "Điểm đạt phải từ 0 đến 100"; return }
        val count = questionCount.toIntOrNull()
        if (questionMode == 1 && (count == null || count < 1 || count > state.totalQuestions)) { localError = "Số câu phải từ 1 đến ${state.totalQuestions}"; return }
        val labelConfig = labelCounts.filterValues { it > 0 }.map { LabelQuestionConfig(it.key, it.value) }
        if (questionMode == 2 && labelConfig.isEmpty()) { localError = "Vui lòng đặt số câu cho ít nhất 1 nhãn"; return }

        localError = null
        val request = CreateExamSessionRequest(
            examRoomId = roomId,
            startTime = Instant.ofEpochMilli(start).toString(),
            endTime = endMillis?.let { Instant.ofEpochMilli(it).toString() },
            assessType = if (accessMode == AccessMode.PUBLIC) 0 else 1,
            allowRetake = allowRetake,
            maxAttempts = attempts,
            accessCode = if (accessMode == AccessMode.CODE) code else null,
            whitelist = if (accessMode == AccessMode.WHITELIST) whitelist.map { it.id } else emptyList(),
            showAnswersAfterSubmit = showAnswers,
            passingScore = pass,
            questionCount = if (questionMode == 1) count else null,
            questionSelectionMode = questionMode,
            labelQuestionConfig = if (questionMode == 2) labelConfig else null,
            shuffleQuestions = shuffle,
        )
        vm.submit(request, onCreated)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(8.dp))
        BackRow(label = roomTitle, onBack = onBack)
        Text("Tạo phiên thi", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onBackground)

        DateTimeField(label = "Thời gian bắt đầu *", valueMillis = startMillis, onChange = { startMillis = it }, modifier = Modifier.fillMaxWidth())
        DateTimeField(label = "Thời gian kết thúc (tuỳ chọn)", valueMillis = endMillis, onChange = { endMillis = it }, clearable = true, modifier = Modifier.fillMaxWidth())

        AccessSection(
            mode = accessMode,
            onModeChange = { accessMode = it },
            code = code,
            onCodeChange = { code = it },
            onGenerateCode = { code = (100000..999999).random().toString() },
            whitelist = whitelist,
            query = query,
            onQueryChange = { query = it; vm.searchUsers(it) },
            searchResults = state.searchResults,
            isSearching = state.isSearching,
            onAddUser = { if (whitelist.none { u -> u.id == it.id }) whitelist.add(it); query = "" },
            onRemoveUser = { whitelist.remove(it) },
        )

        QuestionConfigSection(
            mode = questionMode,
            onModeChange = { questionMode = it },
            totalQuestions = state.totalQuestions,
            questionCount = questionCount,
            onQuestionCountChange = { questionCount = it },
            labels = state.labels,
            unlabeledCount = state.unlabeledCount,
            labelCounts = labelCounts,
            onLabelCountChange = { id, n -> if (n > 0) labelCounts[id] = n else labelCounts.remove(id) },
        )

        SwitchRow("Xáo trộn thứ tự câu hỏi", shuffle) { shuffle = it }
        SwitchRow("Xem đáp án sau khi nộp", showAnswers) { showAnswers = it }
        SwitchRow("Cho phép làm lại", allowRetake) { allowRetake = it }
        if (allowRetake) {
            OutlinedTextField(
                value = maxAttempts,
                onValueChange = { maxAttempts = it.filter { c -> c.isDigit() } },
                label = { Text("Số lần làm tối đa (1–10)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        OutlinedTextField(
            value = passingScore,
            onValueChange = { passingScore = it.filter { c -> c.isDigit() } },
            label = { Text("Điểm đạt (%)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        (localError ?: state.error)?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

        Button(
            onClick = { submit() },
            enabled = !state.isSubmitting,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary),
        ) {
            if (state.isSubmitting) {
                CircularProgressIndicator(modifier = Modifier.height(18.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
            } else {
                Text("Tạo phiên thi")
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
