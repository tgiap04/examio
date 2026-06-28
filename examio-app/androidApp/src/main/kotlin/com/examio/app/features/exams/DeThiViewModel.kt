package com.examio.app.features.exams

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.exams.models.QuizSet
import com.examio.app.features.exams.repository.ExamRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class DeThiState(
    val isLoading: Boolean = false,
    val quizSets: List<QuizSet> = emptyList(),
    val totalQuestions: Int = 0,
    val error: String? = null,
)

class DeThiViewModel(private val repository: ExamRepository) : ViewModel() {
    private val _state = MutableStateFlow(DeThiState())
    val state: StateFlow<DeThiState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            when (val res = repository.quizSets(page = 1, limit = 50)) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    isLoading = false,
                    quizSets = res.data.quizSets,
                    totalQuestions = res.data.quizSets.sumOf { it.questionCount },
                )
                is ApiResult.HttpError -> _state.value = _state.value.copy(isLoading = false, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isLoading = false, error = res.message)
            }
        }
    }
}
