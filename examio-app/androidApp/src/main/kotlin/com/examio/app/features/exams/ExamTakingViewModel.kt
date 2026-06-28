package com.examio.app.features.exams

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.exams.models.DecryptedQuestion
import com.examio.app.features.exams.models.SecureAnswer
import com.examio.app.features.exams.models.SecureSubmitResponse
import com.examio.app.features.exams.models.SubmitExamAttemptRequest
import com.examio.app.features.exams.models.UpdateProgressRequest
import com.examio.app.features.exams.repository.ExamRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class ExamTakingState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val attemptId: String = "",
    val questions: List<DecryptedQuestion> = emptyList(),
    val currentIndex: Int = 0,
    // answers keyed by "q_<index>" → chosen option text, mirrors FE savedAnswers.
    val answers: Map<String, String> = emptyMap(),
    val markedIndices: Set<Int> = emptySet(),
    val timeLimitMinutes: Int? = null,
    val remainingSeconds: Int? = null,
    val isSubmitting: Boolean = false,
    val result: SecureSubmitResponse? = null,
)

class ExamTakingViewModel(
    private val examSessionId: String,
    private val repository: ExamRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ExamTakingState())
    val state: StateFlow<ExamTakingState> = _state

    private var timerJob: Job? = null
    private var autosaveJob: Job? = null

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            when (val started = repository.startAttempt(examSessionId)) {
                is ApiResult.Success -> loadQuiz(started.data.id)
                is ApiResult.HttpError -> fail(started.message)
                is ApiResult.NetworkError -> fail(started.message)
            }
        }
    }

    private suspend fun loadQuiz(attemptId: String) {
        when (val quiz = repository.decryptedQuiz(attemptId)) {
            is ApiResult.Success -> {
                val raw = quiz.data.raw
                _state.value = _state.value.copy(
                    isLoading = false,
                    attemptId = attemptId,
                    questions = quiz.data.questions,
                    answers = raw.answers,
                    markedIndices = raw.markedQuestions.mapNotNull { it.removePrefix("q_").toIntOrNull() }.toSet(),
                    currentIndex = raw.currentIndex.coerceIn(0, (quiz.data.questions.size - 1).coerceAtLeast(0)),
                    timeLimitMinutes = raw.timeLimitMinutes,
                    remainingSeconds = raw.timeLimitMinutes?.let { it * 60 },
                )
                startTimer()
            }
            is ApiResult.HttpError -> fail(quiz.message)
            is ApiResult.NetworkError -> fail(quiz.message)
        }
    }

    private fun startTimer() {
        if (_state.value.remainingSeconds == null || _state.value.questions.isEmpty()) return
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            while (true) {
                delay(1000)
                val remaining = (_state.value.remainingSeconds ?: return@launch) - 1
                if (remaining <= 0) {
                    _state.value = _state.value.copy(remainingSeconds = 0)
                    submit()
                    return@launch
                }
                _state.value = _state.value.copy(remainingSeconds = remaining)
            }
        }
    }

    fun selectAnswer(index: Int, option: String) {
        _state.value = _state.value.copy(answers = _state.value.answers + ("q_$index" to option))
        scheduleAutosave()
    }

    fun toggleMark(index: Int) {
        val marked = _state.value.markedIndices
        _state.value = _state.value.copy(
            markedIndices = if (index in marked) marked - index else marked + index,
        )
        scheduleAutosave()
    }

    fun navigate(index: Int) {
        val size = _state.value.questions.size
        if (size == 0) return
        _state.value = _state.value.copy(currentIndex = index.coerceIn(0, size - 1))
    }

    fun next() = navigate(_state.value.currentIndex + 1)
    fun previous() = navigate(_state.value.currentIndex - 1)

    private fun scheduleAutosave() {
        autosaveJob?.cancel()
        autosaveJob = viewModelScope.launch {
            delay(3000)
            val s = _state.value
            if (s.attemptId.isEmpty()) return@launch
            repository.updateProgress(
                s.attemptId,
                UpdateProgressRequest(
                    answers = s.answers,
                    markedQuestions = s.markedIndices.map { "q_$it" },
                    currentIndex = s.currentIndex,
                ),
            )
        }
    }

    fun submit() {
        // Cancel the countdown FIRST so an expiring timer can't race a user tap into a double submit.
        timerJob?.cancel()
        val s = _state.value
        if (s.isSubmitting || s.attemptId.isEmpty()) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, error = null)
            val answers = s.questions.mapNotNull { q ->
                s.answers["q_${q.index}"]?.let { SecureAnswer(token = q.token, chosen_option = it) }
            }
            when (val res = repository.submit(s.attemptId, SubmitExamAttemptRequest(answers))) {
                is ApiResult.Success -> _state.value = _state.value.copy(isSubmitting = false, result = res.data)
                is ApiResult.HttpError -> _state.value = _state.value.copy(isSubmitting = false, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isSubmitting = false, error = res.message)
            }
        }
    }

    private fun fail(message: String) {
        _state.value = _state.value.copy(isLoading = false, error = message)
    }

    override fun onCleared() {
        timerJob?.cancel()
        autosaveJob?.cancel()
        super.onCleared()
    }
}
