package com.examio.app.features.exams.room

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.examio.app.core.network.ApiResult
import com.examio.app.features.exams.models.AvailableLabel
import com.examio.app.features.exams.models.CreateExamSessionRequest
import com.examio.app.features.exams.models.SearchUser
import com.examio.app.features.exams.repository.ExamRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class CreateExamSessionState(
    val isLoadingLabels: Boolean = false,
    val totalQuestions: Int = 0,
    val labels: List<AvailableLabel> = emptyList(),
    val unlabeledCount: Int = 0,
    val searchResults: List<SearchUser> = emptyList(),
    val isSearching: Boolean = false,
    val isSubmitting: Boolean = false,
    val error: String? = null,
)

class CreateExamSessionViewModel(
    private val roomId: String,
    private val repository: ExamRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(CreateExamSessionState())
    val state: StateFlow<CreateExamSessionState> = _state

    init { loadLabels() }

    fun loadLabels() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoadingLabels = true)
            when (val res = repository.availableLabels(roomId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    isLoadingLabels = false,
                    totalQuestions = res.data.totalQuestions,
                    labels = res.data.labels,
                    unlabeledCount = res.data.unlabeledCount,
                )
                is ApiResult.HttpError -> _state.value = _state.value.copy(isLoadingLabels = false, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isLoadingLabels = false, error = res.message)
            }
        }
    }

    private var searchJob: Job? = null

    fun searchUsers(query: String) {
        // Cancel any in-flight search so a slower earlier response can't overwrite a newer one.
        searchJob?.cancel()
        val trimmed = query.trim()
        if (trimmed.length < 2) {
            _state.value = _state.value.copy(searchResults = emptyList(), isSearching = false)
            return
        }
        searchJob = viewModelScope.launch {
            delay(300) // debounce keystrokes
            _state.value = _state.value.copy(isSearching = true)
            when (val res = repository.searchUsers(trimmed)) {
                is ApiResult.Success -> _state.value = _state.value.copy(isSearching = false, searchResults = res.data)
                is ApiResult.HttpError -> _state.value = _state.value.copy(isSearching = false, searchResults = emptyList())
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isSearching = false, searchResults = emptyList())
            }
        }
    }

    fun submit(request: CreateExamSessionRequest, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(isSubmitting = true, error = null)
            when (val res = repository.createExamSession(request)) {
                is ApiResult.Success -> { _state.value = _state.value.copy(isSubmitting = false); onSuccess() }
                is ApiResult.HttpError -> _state.value = _state.value.copy(isSubmitting = false, error = res.message)
                is ApiResult.NetworkError -> _state.value = _state.value.copy(isSubmitting = false, error = res.message)
            }
        }
    }
}
