package com.examio.app.features.exams.room

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.exams.models.CreateExamRoomRequest
import com.examio.app.features.exams.models.QuizSet
import com.examio.app.features.exams.repository.ExamRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class CreateExamRoomState(
    val quizSets: List<QuizSet> = emptyList(),
    val isLoadingQuizSets: Boolean = false,
    val isSubmitting: Boolean = false,
    val error: String? = null,
)

class CreateExamRoomViewModel(private val repository: ExamRepository) : ViewModel() {
    private val _state = MutableStateFlow(CreateExamRoomState())
    val state: StateFlow<CreateExamRoomState> = _state

    init { loadQuizSets() }

    fun loadQuizSets() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoadingQuizSets = true, error = null)
            when (val res = repository.quizSets(page = 1, limit = 100)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isLoadingQuizSets = false, quizSets = res.data.quizSets)
                is ApiResult.HttpError -> _state.value = _state.value.copy(isLoadingQuizSets = false, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isLoadingQuizSets = false, error = res.message)
            }
        }
    }

    fun submit(title: String, description: String?, quizSetId: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, error = null)
            val request = CreateExamRoomRequest(
                title = title.trim(),
                description = description?.trim()?.ifEmpty { null },
                quizSetId = quizSetId,
            )
            when (val res = repository.createExamRoom(request)) {
                is ApiResult.Success -> { _state.value = _state.value.copy(isSubmitting = false); onSuccess() }
                is ApiResult.HttpError -> _state.value = _state.value.copy(isSubmitting = false, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isSubmitting = false, error = res.message)
            }
        }
    }

    fun clearError() { _state.value = _state.value.copy(error = null) }
}
